/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

// Parse incoming JSON payloads
app.use(express.json());

// Initialize Gemini Client as a robust fallback
let aiClient: GoogleGenAI | null = null;
try {
  if (process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
} catch (err) {
  console.error('Failed to initialize fallback Gemini client:', err);
}

// System prompt for parsing natural language pizza orders
const PIZZA_AI_SYSTEM_PROMPT = `You are an AI assistant for SliceMatic pizzeria. Your job is to extract ordering details from a sentence spoken by the counter staff and output a strict JSON format.
Extracted JSON schema must be:
{
"customer_name": string or null,
"customer_phone": string or null,
"quantity": integer or null,
"base_name": string or null,
"pizza_name": string or null,
"topping_name": string or null,
"payment_mode": "Cash" | "Card" | "UPI" | null
}
Do not include markdown formatting or extra text. Only output raw JSON. If data is missing, leave it as null.`;

/**
 * API Endpoint: Process natural language pizza orders into JSON
 * Interfaces with OpenRouter API, with a graceful fallback to Gemini API.
 */
app.post('/api/parse-order', async (req: Request, res: Response): Promise<void> => {
  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'Please provide a valid "text" field to parse.' });
    return;
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  
  // If OpenRouter API key is available, attempt to query OpenRouter
  if (openRouterKey && openRouterKey !== 'MY_OPENROUTER_API_KEY' && openRouterKey.trim() !== '') {
    try {
      console.log('Attempting to process order using OpenRouter...');
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
          'X-Title': 'SliceMatic Pizza Order Extractor',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash', // A standard high-performance, fast model
          messages: [
            { role: 'system', content: PIZZA_AI_SYSTEM_PROMPT },
            { role: 'user', content: text }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter returned status code ${response.status}`);
      }

      const data = await response.json();
      const rawText = data.choices?.[0]?.message?.content;
      
      if (!rawText) {
        throw new Error('OpenRouter response did not contain message content.');
      }

      // Parse and send the JSON extraction
      const extractedJson = JSON.parse(rawText.trim());
      res.json({
        success: true,
        source: 'openrouter',
        data: extractedJson,
      });
      return;
    } catch (openRouterError: any) {
      console.warn('OpenRouter processing failed, attempting Gemini fallback:', openRouterError.message);
      // Fall through to Gemini client if OpenRouter fails
    }
  }

  // Fallback to Google Gemini SDK (if Gemini API key is present)
  if (aiClient) {
    try {
      console.log('Processing order using fallback Google Gemini client...');
      const response = await aiClient.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: text,
        config: {
          systemInstruction: PIZZA_AI_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              customer_name: { type: Type.STRING, description: 'Extracted customer name' },
              customer_phone: { type: Type.STRING, description: '10 digit phone number starting with 6, 7, 8, or 9' },
              quantity: { type: Type.INTEGER, description: 'Integer from 1 to 10' },
              base_name: { type: Type.STRING, description: 'Pizza base name (e.g. Thin Crust, Pan Pizza, Cheese Burst, Gluten Free)' },
              pizza_name: { type: Type.STRING, description: 'Pizza type name (e.g. Classic Margherita, Double Pepperoni, Garden Veggie Feast, BBQ Chicken Delight)' },
              topping_name: { type: Type.STRING, description: 'Topping name (e.g. Extra Mozzarella, Sautéed Mushrooms, Black Olives, Spicy Jalapeños, Tri-Color Bell Peppers)' },
              payment_mode: { 
                type: Type.STRING, 
                enum: ['Cash', 'Card', 'UPI'],
                description: 'Payment mode strictly matching one of the options'
              }
            }
          }
        },
      });

      const rawText = response.text;
      if (rawText) {
        const extractedJson = JSON.parse(rawText.trim());
        res.json({
          success: true,
          source: 'gemini_fallback',
          data: extractedJson,
        });
        return;
      }
    } catch (geminiError: any) {
      console.error('Gemini fallback failed:', geminiError);
    }
  }

  // If both options failed or were not configured
  res.status(500).json({
    success: false,
    error: 'Failed to process natural language request. Ensure OPENROUTER_API_KEY or GEMINI_API_KEY is configured.',
    note: 'If you are running in AI Studio, configure GEMINI_API_KEY or OPENROUTER_API_KEY in the Secrets panel.',
  });
});

/**
 * API Endpoint: Translate natural language questions about business performance into SQL,
 * providing a detailed explanation and simulated database execution rows matching the schema.
 */
app.post('/api/analyze-query', async (req: Request, res: Response): Promise<void> => {
  const { question, db_data } = req.body;

  if (!question || typeof question !== 'string') {
    res.status(400).json({ error: 'Please provide a valid "question" in the request body.' });
    return;
  }

  if (!aiClient) {
    res.status(500).json({
      success: false,
      error: 'Google Gemini client is not initialized. Please configure your GEMINI_API_KEY in the Secrets panel.',
    });
    return;
  }

  try {
    console.log('Generating business performance SELECT query & mock/real records using Gemini...');
    let prompt = `You are a brilliant business data analyst for SliceMatic pizza shop. 
Your target database is PostgreSQL. You have access to the following table schemas:

1. orders (id, created_at, customer_name, customer_phone, quantity, subtotal, discount_amount, gst_amount, final_total, payment_mode, order_source, order_status)
2. menu_items (id, category, name, price_inr)
3. order_line_items (id, order_id, base_id, pizza_id, topping_id)

Given the user's natural language question: "${question}"
Your job is to generate a valid, highly efficient PostgreSQL SELECT query that extracts the answer, explain it briefly, and provide the query output rows.

CRITICAL RULES:
- Only generate SELECT queries. Never generate INSERT, UPDATE, DELETE, or DROP operations.
- Assume Sunday=0 and Saturday=6 for date parts if weekend queries are requested.
- Ensure columns and tables exist strictly in the schema list above.
`;

    if (db_data) {
      prompt += `
CRITICAL: The user has their real live Supabase database connected!
Here is the actual, real-time data currently fetched from their database tables:
${JSON.stringify(db_data, null, 2)}

Because you have access to their real data, you MUST analyze this dataset, execute the SQL query logic in-memory over these actual rows, and return the REAL query results in the "simulated_results" array.
Do not invent mock data. "simulated_results" must contain the exact computed result rows of running your SQL query against the real tables provided above.
`;
    } else {
      prompt += `
Since there is no live database connected, please provide a realistic set of query output rows representing the data that would be returned from a populated SliceMatic database.
`;
    }

    prompt += `
You MUST return a JSON object strictly adhering to this schema:
{
  "sql": "The raw PostgreSQL SELECT query string. Do not wrap in markdown backticks or include any extra commentary.",
  "explanation": "A clean, friendly, jargon-free explanation (max 2 sentences) of what the SQL query evaluates.",
  "columns": ["Array of column names returned by the SELECT query in order (e.g. ['customer_name', 'final_total'])"],
  "simulated_results": [
    {"column_name_1": "value1", "column_name_2": 150.00},
    ...
  ]
}
Make sure all keys match precisely. "simulated_results" must be a list of realistic objects matching the columns array. If no rows are found, return an empty array.`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['sql', 'explanation', 'columns', 'simulated_results'],
          properties: {
            sql: { type: Type.STRING, description: 'Raw SELECT SQL query string' },
            explanation: { type: Type.STRING, description: 'User-friendly business explanation' },
            columns: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'List of SELECT column names'
            },
            simulated_results: {
              type: Type.ARRAY,
              items: { type: Type.OBJECT },
              description: 'Real computed output rows or simulated output rows'
            }
          }
        }
      }
    });

    const jsonText = response.text;
    if (jsonText) {
      const parsed = JSON.parse(jsonText.trim());
      // Extra safety sanitization for raw SQL string
      if (parsed.sql && parsed.sql.startsWith('```')) {
        parsed.sql = parsed.sql.replace(/^```(sql)?\n?/i, '').replace(/\n?```$/i, '').trim();
      }
      res.json({
        success: true,
        ...parsed,
      });
      return;
    }

    throw new Error('Gemini model did not return any output text.');
  } catch (err: any) {
    console.error('Gemini query generation failed:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to generate query.',
    });
  }
});

/**
 * API Endpoint: Fetch Supabase configuration from server environment variables if configured
 */
app.get('/api/supabase-config', (req: Request, res: Response) => {
  res.json({
    url: process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_ANON_KEY || ''
  });
});

// Setup dev server with Vite or production file serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
