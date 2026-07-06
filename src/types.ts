/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PaymentMode = 'Cash' | 'Card' | 'UPI';

export interface PizzaBase {
  id: string;
  name: string;
  price: number;
}

export interface PizzaType {
  id: string;
  name: string;
  price: number;
}

export interface PizzaTopping {
  id: string;
  name: string;
  price: number;
}

export interface PizzaOrderInput {
  customerName: string;
  customerPhone: string;
  baseId: string;
  typeId: string;
  toppingId: string;
  quantity: number; // must be 1 to 10
  paymentMode?: PaymentMode;
  orderSource?: string;
}

export interface OrderFinancials {
  unitPrice: number;
  subtotal: number;
  discount: number;
  postDiscountTotal: number;
  gst: number;
  finalTotal: number;
  hasDiscount: boolean;
}

export interface ValidationError {
  customerName?: string;
  customerPhone?: string;
  quantity?: string;
  paymentMode?: string;
  general?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError;
}

export interface DatabaseOrder {
  id?: string;
  customer_name: string;
  customer_phone: string;
  payment_mode: PaymentMode;
  quantity: number;
  subtotal: number;
  discount: number;
  gst: number;
  final_total: number;
  created_at?: string;
}

export interface DatabaseOrderItem {
  id?: string;
  order_id?: string;
  base_name: string;
  pizza_name: string;
  topping_name: string;
  unit_price: number;
}

export interface UnitTestResult {
  name: string;
  description: string;
  input: any;
  expectedValid: boolean;
  actualValid: boolean;
  expectedErrors: string[];
  actualErrors: string[];
  passed: boolean;
}
