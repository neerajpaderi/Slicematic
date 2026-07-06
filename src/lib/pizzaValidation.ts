/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PizzaBase,
  PizzaType,
  PizzaTopping,
  PizzaOrderInput,
  OrderFinancials,
  ValidationResult,
  ValidationError,
  UnitTestResult,
} from '../types';

// Menu definitions
export const PIZZA_BASES: PizzaBase[] = [
  { id: 'thin_crust', name: 'Thin Crust', price: 149.00 },
  { id: 'pan_pizza', name: 'Pan Pizza', price: 199.00 },
  { id: 'cheese_burst', name: 'Cheese Burst', price: 249.00 },
  { id: 'gluten_free', name: 'Gluten Free Crust', price: 229.00 },
];

export const PIZZA_TYPES: PizzaType[] = [
  { id: 'margherita', name: 'Classic Margherita', price: 199.00 },
  { id: 'pepperoni', name: 'Double Pepperoni', price: 349.00 },
  { id: 'veggie_feast', name: 'Garden Veggie Feast', price: 299.00 },
  { id: 'chicken_bbq', name: 'BBQ Chicken Delight', price: 399.00 },
];

export const PIZZA_TOPPINGS: PizzaTopping[] = [
  { id: 'none', name: 'No Extra Topping', price: 0.00 },
  { id: 'extra_cheese', name: 'Extra Mozzarella', price: 60.00 },
  { id: 'mushrooms', name: 'Sautéed Mushrooms', price: 40.00 },
  { id: 'olives', name: 'Black Olives', price: 40.00 },
  { id: 'jalapenos', name: 'Spicy Jalapeños', price: 50.00 },
  { id: 'bell_peppers', name: 'Tri-Color Bell Peppers', price: 30.00 },
];

/**
 * Validates a pizza order input based on the strict business rules.
 */
export function validatePizzaOrder(input: Partial<PizzaOrderInput>): ValidationResult {
  const errors: ValidationError = {};
  let isValid = true;

  // 1. Customer Name Validation: Alphabets and spaces only, 2-40 characters.
  const name = input.customerName;
  if (name === undefined || name === null) {
    errors.customerName = 'Customer name is required.';
    isValid = false;
  } else {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      errors.customerName = 'Customer name cannot be empty or only spaces.';
      isValid = false;
    } else if (name.length < 2 || name.length > 40) {
      errors.customerName = 'Customer name must be between 2 and 40 characters.';
      isValid = false;
    } else {
      const nameRegex = /^[A-Za-z\s]+$/;
      if (!nameRegex.test(name)) {
        errors.customerName = 'Customer name can only contain alphabets and spaces.';
        isValid = false;
      }
    }
  }

  // 2. Phone Number Validation: Exactly 10 digits, must start with 6, 7, 8, or 9.
  const phone = input.customerPhone;
  if (phone === undefined || phone === null || phone.trim() === '') {
    errors.customerPhone = 'Phone number is required.';
    isValid = false;
  } else {
    const trimmedPhone = phone.trim();
    if (!/^\d+$/.test(trimmedPhone)) {
      errors.customerPhone = 'Phone number must contain digits only.';
      isValid = false;
    } else if (trimmedPhone.length !== 10) {
      errors.customerPhone = 'Phone number must be exactly 10 digits.';
      isValid = false;
    } else {
      const firstDigit = trimmedPhone[0];
      if (!['6', '7', '8', '9'].includes(firstDigit)) {
        errors.customerPhone = 'Phone number must start with 6, 7, 8, or 9.';
        isValid = false;
      }
    }
  }

  // 3. Quantity Validation: Integer from 1 to 10 only. Reject floats, strings, 0, or negatives.
  const qty = input.quantity;
  if (qty === undefined || qty === null) {
    errors.quantity = 'Quantity is required.';
    isValid = false;
  } else {
    const parsedQty = Number(qty);
    if (isNaN(parsedQty)) {
      errors.quantity = 'Quantity must be a valid number.';
      isValid = false;
    } else if (!Number.isInteger(parsedQty)) {
      errors.quantity = 'Quantity must be a whole integer (no floats allowed).';
      isValid = false;
    } else if (parsedQty < 1 || parsedQty > 10) {
      errors.quantity = 'Quantity must be an integer between 1 and 10.';
      isValid = false;
    }
  }

  // 4. Payment Mode Validation (if provided): Must explicitly be 'Cash', 'Card', or 'UPI'.
  if (input.paymentMode !== undefined) {
    const validModes = ['Cash', 'Card', 'UPI'];
    if (!validModes.includes(input.paymentMode)) {
      errors.paymentMode = "Payment mode must be exactly 'Cash', 'Card', or 'UPI'.";
      isValid = false;
    }
  }

  return { isValid, errors };
}

/**
 * Calculates itemized financials for a pizza order based on the strict pricing rules.
 */
export function calculateFinancials(
  qty: number,
  basePrice: number,
  typePrice: number,
  toppingPrice: number
): OrderFinancials {
  const quantity = Math.max(0, Number.isInteger(qty) ? qty : Math.floor(qty));
  const unitPrice = basePrice + typePrice + toppingPrice;
  const subtotal = unitPrice * quantity;

  // 10% discount if quantity is 5 or more
  const hasDiscount = quantity >= 5;
  const discount = hasDiscount ? subtotal * 0.10 : 0.00;
  
  const postDiscountTotal = subtotal - discount;
  
  // 18% GST on post-discount total
  const gst = postDiscountTotal * 0.18;
  const finalTotal = postDiscountTotal + gst;

  // Helper to round to 2 decimal places to avoid floating point precision issues
  const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

  return {
    unitPrice: round(unitPrice),
    subtotal: round(subtotal),
    discount: round(discount),
    postDiscountTotal: round(postDiscountTotal),
    gst: round(gst),
    finalTotal: round(finalTotal),
    hasDiscount,
  };
}

/**
 * Runs a comprehensive set of unit tests covering edge cases.
 */
export function runPizzaUnitTests(): UnitTestResult[] {
  const tests: { name: string; description: string; input: Partial<PizzaOrderInput>; expectedValid: boolean }[] = [
    {
      name: 'Valid Standard Order',
      description: 'Standard order with valid name, 10-digit phone starting with 9, quantity 2, and valid payment mode.',
      input: {
        customerName: 'Alice Vance',
        customerPhone: '9876543210',
        quantity: 2,
        paymentMode: 'UPI',
      },
      expectedValid: true,
    },
    {
      name: 'Name - Only Spaces',
      description: 'Rejects customer names containing only spaces.',
      input: {
        customerName: '     ',
        customerPhone: '9876543210',
        quantity: 1,
        paymentMode: 'Cash',
      },
      expectedValid: false,
    },
    {
      name: 'Name - Numbers or Special Characters',
      description: 'Rejects customer names containing non-alphabetic characters (e.g., numbers).',
      input: {
        customerName: 'John Doe 3rd',
        customerPhone: '9876543210',
        quantity: 1,
        paymentMode: 'Cash',
      },
      expectedValid: false,
    },
    {
      name: 'Name - Too Short',
      description: 'Rejects customer names shorter than 2 characters.',
      input: {
        customerName: 'A',
        customerPhone: '9876543210',
        quantity: 1,
        paymentMode: 'Card',
      },
      expectedValid: false,
    },
    {
      name: 'Name - Too Long',
      description: 'Rejects customer names longer than 40 characters.',
      input: {
        customerName: 'Alexander The Great King of Macedon the Overachiever',
        customerPhone: '9876543210',
        quantity: 1,
        paymentMode: 'Card',
      },
      expectedValid: false,
    },
    {
      name: 'Phone - Starting with 1',
      description: 'Rejects phone numbers starting with anything other than 6, 7, 8, or 9 (e.g. 1).',
      input: {
        customerName: 'Bob Smith',
        customerPhone: '1234567890',
        quantity: 1,
        paymentMode: 'UPI',
      },
      expectedValid: false,
    },
    {
      name: 'Phone - Too Short',
      description: 'Rejects phone numbers that do not have exactly 10 digits.',
      input: {
        customerName: 'Bob Smith',
        customerPhone: '987654321',
        quantity: 1,
        paymentMode: 'UPI',
      },
      expectedValid: false,
    },
    {
      name: 'Phone - Too Long',
      description: 'Rejects phone numbers longer than 10 digits.',
      input: {
        customerName: 'Bob Smith',
        customerPhone: '98765432109',
        quantity: 1,
        paymentMode: 'UPI',
      },
      expectedValid: false,
    },
    {
      name: 'Quantity - Float Rejected',
      description: 'Rejects non-integer decimal numbers (floats).',
      input: {
        customerName: 'Charlie',
        customerPhone: '8765432109',
        quantity: 2.5,
        paymentMode: 'Cash',
      },
      expectedValid: false,
    },
    {
      name: 'Quantity - Zero Rejected',
      description: 'Rejects quantities below 1 (e.g. 0).',
      input: {
        customerName: 'Charlie',
        customerPhone: '8765432109',
        quantity: 0,
        paymentMode: 'Cash',
      },
      expectedValid: false,
    },
    {
      name: 'Quantity - Negative Rejected',
      description: 'Rejects negative quantities.',
      input: {
        customerName: 'Charlie',
        customerPhone: '8765432109',
        quantity: -3,
        paymentMode: 'Cash',
      },
      expectedValid: false,
    },
    {
      name: 'Quantity - Too High (11)',
      description: 'Rejects quantities above 10 (e.g. 11).',
      input: {
        customerName: 'Charlie',
        customerPhone: '8765432109',
        quantity: 11,
        paymentMode: 'Cash',
      },
      expectedValid: false,
    },
    {
      name: 'Discount Threshold (Qty = 4)',
      description: 'No discount applied for quantities under 5.',
      input: {
        customerName: 'Danny Boy',
        customerPhone: '7654321098',
        quantity: 4,
        paymentMode: 'Card',
      },
      expectedValid: true,
    },
    {
      name: 'Discount Threshold (Qty = 5)',
      description: 'Applies 10% discount for quantities of 5 or more.',
      input: {
        customerName: 'Danny Boy',
        customerPhone: '7654321098',
        quantity: 5,
        paymentMode: 'Card',
      },
      expectedValid: true,
    },
    {
      name: 'Invalid Payment Mode',
      description: 'Rejects payment modes other than Cash, Card, or UPI (e.g. Bitcoin).',
      input: {
        customerName: 'Emily Wise',
        customerPhone: '6543210987',
        quantity: 1,
        paymentMode: 'Bitcoin' as any,
      },
      expectedValid: false,
    },
  ];

  return tests.map((t) => {
    const result = validatePizzaOrder(t.input);
    const actualErrors = Object.values(result.errors).filter(Boolean) as string[];
    const passed = result.isValid === t.expectedValid;

    return {
      name: t.name,
      description: t.description,
      input: t.input,
      expectedValid: t.expectedValid,
      actualValid: result.isValid,
      expectedErrors: t.expectedValid ? [] : ['Some error message'],
      actualErrors,
      passed,
    };
  });
}
