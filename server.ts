/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import path from 'path';
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
 * API Endpoint: Chatbot ordering assistant using OpenRouter and fallback to Gemini
 */
app.post('/api/chat-order', async (req: Request, res: Response): Promise<void> => {
  const { messages, cart, customerName, customerPhone, paymentMode } = req.body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'Please provide a valid "messages" array.' });
    return;
  }

  const currentCartDesc = cart && Array.isArray(cart) && cart.length > 0
    ? cart.map((item: any) => `${item.quantity}x ${item.pizzaName} on ${item.baseName} crust (Toppings: ${item.toppingName})`).join(', ')
    : 'Empty';

  const systemPrompt = `You are a warm, polite, and efficient AI ordering assistant for SliceMatic pizzeria (dine-in / self-order).
Your task is to conversationalize with the customer, guide them through our mandatory ordering steps, and output a strict JSON format containing both your natural conversation response ("reply") and any extracted fields.

MANDATORY WORKFLOW STEPS:
1. **Pizza Selection**: If the cart is empty and the user hasn't specified what pizza they want, ask them what pizza they would like. Guide them through choosing a pizza flavor (e.g. Margherita, Double Pepperoni, Veggie), crust base (Thin Crust, Cheese Burst, Pan), and extra premium toppings.
   - If they specify a pizza details, extract "pizza_name", "base_name", "topping_name", and "quantity". The frontend will automatically add this item to the cart!
2. **Contact Details (MANDATORY)**: Once there are items in the cart (or if the user has just selected a pizza), you MUST get the customer's name and 10-digit mobile number. If they are not already provided (check Current State below), ask for them. Do not skip this; getting Name and Mobile Number is mandatory.
3. **Payment Method (MANDATORY)**: Once there is at least one item in the cart AND we have their name and mobile number, you MUST ask for their preferred payment method. The only supported methods are "Cash", "Card", or "UPI". This is mandatory.
4. **Order Confirmation & Placement**: Once we have items in the cart, name, phone, and payment method:
   - Present a complete summary of the order to the customer.
   - Set "order_action" to "submit_order" so the frontend can automatically place and submit the order in the database, pop up the dine-in order confirmation, and dispatch the digital receipt SMS!

CURRENT STATE:
- Items in Cart: ${currentCartDesc}
- Customer Name: ${customerName || 'None'}
- Customer Phone: ${customerPhone || 'None'}
- Payment Mode: ${paymentMode || 'None'}

Please inspect the conversation and the Current State above. If a value is already provided in the Current State, do not ask for it again; instead, proceed to the next missing mandatory field!

Your output must be a strict JSON object with EXACTLY this structure (no markdown formatting, no backticks, no text outside the JSON):
{
  "reply": "Write your friendly conversational reply here, guiding the user to the next step or confirming details.",
  "customer_name": "string (the extracted name, or keep the existing one if present) or null",
  "customer_phone": "string (the extracted 10-digit mobile number, or keep existing) or null",
  "quantity": "integer (extracted quantity of the new pizza item being added) or null",
  "base_name": "string (extracted base crust: e.g. Thin Crust, Cheese Burst, Pan) or null",
  "pizza_name": "string (extracted pizza flavor name: e.g. Margherita, Pepperoni) or null",
  "topping_name": "string (extracted premium toppings) or null",
  "payment_mode": "Cash" | "Card" | "UPI" or null (keep existing if present)",
  "order_action": "add_to_cart" | "submit_order" | "none"
}

CRITICAL:
- If you are extracting a pizza to add to the cart, set "order_action" to "add_to_cart".
- If the cart is not empty, name and phone are filled, and the user has chosen their payment mode, set "order_action" to "submit_order" so the system can automatically place and complete the order.
- Otherwise, set "order_action" to "none".`;

  const openRouterKey = process.env.OPENROUTER_API_KEY;

  if (openRouterKey && openRouterKey !== 'MY_OPENROUTER_API_KEY' && openRouterKey.trim() !== '') {
    try {
      console.log('Attempting to process chatbot order using OpenRouter...');
      
      const formattedMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.map((m: any) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content
        }))
      ];

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
          'X-Title': 'SliceMatic Pizza Order Chatbot',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: formattedMessages,
          temperature: 0.1,
          response_format: { type: 'json_object' }
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter returned status code ${response.status}`);
      }

      const data = await response.json();
      const rawText = data.choices?.[0]?.message?.content?.trim();

      if (!rawText) {
        throw new Error('OpenRouter response did not contain content.');
      }

      let parsedData = null;
      try {
        parsedData = JSON.parse(rawText);
      } catch (pe) {
        // Not a JSON block
      }

      res.json({
        success: true,
        source: 'openrouter',
        text: parsedData?.reply || rawText,
        data: parsedData,
      });
      return;
    } catch (openRouterError: any) {
      console.warn('OpenRouter chatbot failed, attempting Gemini fallback:', openRouterError.message);
    }
  }

  if (aiClient) {
    try {
      console.log('Chatbot ordering using fallback Google Gemini client...');
      
      const lastMessage = messages[messages.length - 1]?.content || '';
      
      const response = await aiClient.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `Previous messages context: ${JSON.stringify(messages)}\n\nLast user message: ${lastMessage}`,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      const rawText = response.text?.trim() || '';
      let parsedData = null;
      try {
        parsedData = JSON.parse(rawText);
      } catch (pe) {
        // Not a JSON block
      }

      res.json({
        success: true,
        source: 'gemini_fallback',
        text: parsedData?.reply || rawText,
        data: parsedData,
      });
      return;
    } catch (geminiError: any) {
      console.error('Gemini chatbot fallback failed:', geminiError);
    }
  }

  res.status(500).json({
    success: false,
    error: 'Failed to process chat order request. Ensure OPENROUTER_API_KEY or GEMINI_API_KEY is configured.',
  });
});

/**
 * API Endpoint: Translate natural language questions about business performance into SQL,
 * providing a detailed explanation and simulated database execution rows matching the schema.
 */
app.post('/api/analyze-query', async (req: Request, res: Response): Promise<void> => {
  const { question, messages, db_data } = req.body;

  if (!question || typeof question !== 'string') {
    res.status(400).json({ error: 'Please provide a valid "question" in the request body.' });
    return;
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const hasOpenRouter = openRouterKey && openRouterKey !== 'MY_OPENROUTER_API_KEY' && openRouterKey.trim() !== '';

  if (!hasOpenRouter && !aiClient) {
    res.status(500).json({
      success: false,
      error: 'No AI service configured. Please configure GEMINI_API_KEY or OPENROUTER_API_KEY in the Secrets panel.',
    });
    return;
  }

  try {
    console.log('Generating business performance SELECT query & mock/real records using Gemini/OpenRouter...');
    let prompt = `
# ROLE
You are "Dough Assistant," the AI analyst for a pizza outlet's owner (the Admin).
The Admin is not technical and does not know how to read dashboards, SQL, or raw
tables — your job is to translate data into plain, actionable business insight.

# WHAT YOU DO
You analyze data from the outlet's database (inventory, employees, sales/pizza orders,
and any other connected tables) to answer the Admin's questions about performance,
trends, and anomalies — e.g. best-selling items, slow-moving inventory, staff
attendance/performance, peak hours, revenue trends, wastage, etc.

# DATA GROUNDING (CRITICAL)
- Only state numbers, trends, or facts that come from actual query results returned
  to you. Never estimate, guess, or fabricate figures.
- If the data needed to answer isn't available or the query returns nothing useful,
  say so plainly and suggest what data/report could help instead.
- If a query result is ambiguous or could be interpreted multiple ways, state your
  interpretation briefly before answering.

# RESPONSE STYLE
- Plain, simple language — no technical jargon (no "SQL," "query," "table," "null,"
  "aggregation," etc.). Explain findings the way you'd explain them to a friend
  running the shop, not a data engineer.
- Lead with the direct answer/insight first, then brief supporting detail.
- Keep responses short by default. Use bullet points or a small table only when
  comparing multiple items (e.g. top 5 pizzas) — don't over-format simple answers.
- End with one relevant follow-up suggestion when it adds value (e.g. "Want me to
  check if this holds for last month too?") — don't force this every time.

# SCOPE / REDIRECTION
- If a question is outside the outlet's business data (e.g. general chit-chat,
  unrelated topics, personal advice), politely decline and redirect: acknowledge
  the question, then suggest a relevant business question they could ask instead.
- If the Admin seems unsure what to ask, proactively suggest 2-3 useful things to
  look into (e.g. "I could check today's best-seller, low-stock ingredients, or
  yesterday's staff hours — want me to look at one of these?").

# OFF-TOPIC ESCALATION
- Track consecutive off-topic messages (not related to the business or current
  analysis thread).
- After 3 consecutive off-topic messages, gently flag it: "I'm best used for
  questions about your outlet's sales, inventory, and staff — happy to help
  whenever you're ready with one of those."
- After 7 consecutive off-topic messages, stop redirecting each time and simply
  give a short, friendly one-line reminder of your purpose, without re-explaining
  fully each time, until the Admin returns to a business question.

# TONE
Warm, respectful, and confident — like a trusted shop manager giving the owner a
quick briefing. Never condescending about the Admin's lack of technical knowledge.

----------------------------------------------------------------------
DATABASE GROUNDING & SCHEMAS:
Your target database is PostgreSQL. You have access to the following 9 table schemas:

1. customers (phone VARCHAR(10) PRIMARY KEY, name VARCHAR(40) NOT NULL, created_at TIMESTAMP)
2. staff_users (id SERIAL PRIMARY KEY, username VARCHAR(50) UNIQUE, password_hash VARCHAR(100), role VARCHAR(20) CHECK (role IN ('cashier', 'admin', 'kitchen')), created_at TIMESTAMP)
3. menu_items (item_id SERIAL PRIMARY KEY, item_code VARCHAR(10) UNIQUE, category VARCHAR(10) CHECK (category IN ('base', 'pizza', 'topping')), name VARCHAR(50) UNIQUE, price NUMERIC(6,2), is_active BOOLEAN)
4. orders (order_id SERIAL PRIMARY KEY, customer_phone VARCHAR(10) REFERENCES customers(phone), quantity INTEGER, subtotal NUMERIC(8,2), discount_amount NUMERIC(8,2), gst_amount NUMERIC(8,2), final_total NUMERIC(8,2), order_time TIMESTAMP)
5. order_items (order_item_id SERIAL PRIMARY KEY, order_id INTEGER REFERENCES orders(order_id), item_id INTEGER REFERENCES menu_items(item_id), item_type VARCHAR(10), item_name VARCHAR(50), unit_price NUMERIC(6,2))
6. payments (payment_id SERIAL PRIMARY KEY, order_id INTEGER REFERENCES orders(order_id), payment_mode VARCHAR(10) CHECK (payment_mode IN ('Cash', 'Card', 'UPI')), paid_at TIMESTAMP)
7. order_status (status_id SERIAL PRIMARY KEY, order_id INTEGER REFERENCES orders(order_id), status VARCHAR(20) CHECK (status IN ('Placed', 'Preparing', 'Ready', 'Completed')), updated_at TIMESTAMP)
8. inventory (inventory_id SERIAL PRIMARY KEY, ingredient_name VARCHAR(30) UNIQUE, unit VARCHAR(10), current_stock NUMERIC(8,2), reorder_threshold NUMERIC(8,2), updated_at TIMESTAMP)
9. menu_item_ingredients (ingredient_map_id SERIAL PRIMARY KEY, item_id INTEGER REFERENCES menu_items(item_id), inventory_id INTEGER REFERENCES inventory(inventory_id), quantity_required NUMERIC(8,3))

USER NEWEST QUESTION: "${question}"
`;

    if (messages && Array.isArray(messages) && messages.length > 0) {
      prompt += `\n\nCONVERSATION HISTORY:\n`;
      messages.slice(-10).forEach((msg: any) => {
        const senderLabel = msg.sender === 'admin' ? 'Admin' : 'Dough Assistant';
        prompt += `${senderLabel}: ${msg.text}\n`;
      });
    }

    if (db_data) {
      prompt += `
CRITICAL: The user has their real live Supabase database connected!
Here is the actual, real-time data currently fetched from their database tables:
${JSON.stringify(db_data, null, 2)}

Because you have access to their real data, you MUST analyze this dataset, execute the SQL query logic in-memory over these actual rows, and return the REAL query results in the "simulated_results" array.
Do not invent mock data. "simulated_results" must contain the exact computed result rows of running your SQL query against the real tables provided above. For example, if they ask for payment modes, join the orders and payments tables in-memory to get exact counts or sum totals!
`;
    } else {
      prompt += `
Since there is no live database connected, please provide a realistic set of query output rows representing the data that would be returned from a populated SliceMatic database.
`;
    }

    prompt += `
You MUST return a JSON object strictly adhering to this schema:
{
  "reply": "Write your friendly conversational response addressing the Admin's latest message in plain, friendly language following all instructions (especially regarding RESPONSE STYLE, SCOPE/REDIRECTION, OFF-TOPIC ESCALATION, TONE).",
  "sql": "The raw PostgreSQL SELECT query string or null if the user message is off-topic or conversational.",
  "explanation": "A clean, friendly, jargon-free explanation (max 2 sentences) of what the SQL query evaluates.",
  "columns": ["Array of column names returned by the SELECT query in order (e.g. ['customer_name', 'final_total'])"],
  "simulated_results": [
    {"column_name_1": "value1", "column_name_2": 150.00}
  ]
}
Make sure all keys match precisely. If no query is executed, set "sql" and "explanation" to null, "columns" and "simulated_results" to empty arrays.`;

    let jsonText = '';
    let usedSource = '';

    if (hasOpenRouter) {
      try {
        console.log('Attempting to analyze query using OpenRouter...');
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
            'X-Title': 'SliceMatic Pizza Business Analyst',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'user', content: prompt }
            ],
            temperature: 0.2,
            response_format: { type: 'json_object' }
          }),
        });

        if (!response.ok) {
          throw new Error(`OpenRouter returned status code ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          jsonText = content;
          usedSource = 'openrouter';
        } else {
          throw new Error('OpenRouter response did not contain content.');
        }
      } catch (openRouterError: any) {
        console.warn('OpenRouter query analysis failed, falling back to Gemini:', openRouterError.message);
      }
    }

    if (!jsonText && aiClient) {
      console.log('Processing query using Google Gemini client...');
      const response = await aiClient.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            required: ['reply', 'sql', 'explanation', 'columns', 'simulated_results'],
            properties: {
              reply: { type: Type.STRING, description: 'Friendly verbal response to the Admin in plain language' },
              sql: { type: Type.STRING, description: 'Raw SELECT SQL query string or null' },
              explanation: { type: Type.STRING, description: 'User-friendly business explanation or null' },
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
      jsonText = response.text || '';
      usedSource = 'gemini';
    }

    if (jsonText) {
      const parsed = JSON.parse(jsonText.trim());
      // Extra safety sanitization for raw SQL string
      if (parsed.sql && parsed.sql.startsWith('```')) {
        parsed.sql = parsed.sql.replace(/^```(sql)?\n?/i, '').replace(/\n?```$/i, '').trim();
      }
      res.json({
        success: true,
        source: usedSource,
        ...parsed,
      });
      return;
    }

    throw new Error('No AI service (OpenRouter or Gemini) returned a response.');
  } catch (err: any) {
    console.error('Query generation failed:', err);
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
    const { createServer: createViteServer } = await import('vite');
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

if (!process.env.VERCEL) {
  startServer();
}

export default app;
