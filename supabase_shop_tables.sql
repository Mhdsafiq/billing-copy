-- ============================================
-- SHOP SUPABASE — Create All Required Tables
-- Run this ONCE in your new Supabase SQL Editor
-- ============================================

-- 1. CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
  id int4 PRIMARY KEY,
  name text,
  gst numeric DEFAULT 0
);

-- 2. PRODUCTS
CREATE TABLE IF NOT EXISTS products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  local_id int4 UNIQUE,
  name text NOT NULL,
  category_id int4,
  category_name text,
  gst_rate numeric DEFAULT 0,
  product_code text,
  price_type text DEFAULT 'exclusive',
  price numeric NOT NULL,
  cost_price numeric DEFAULT 0,
  quantity numeric DEFAULT 0,
  unit text DEFAULT 'pcs',
  barcode text,
  expiry_date text,
  default_discount numeric DEFAULT 0,
  weight text,
  brand text,
  product_type text DEFAULT 'packaged',
  stock_unit text,
  image text,
  updated_at timestamptz DEFAULT now()
);

-- 3. CUSTOMERS
CREATE TABLE IF NOT EXISTS customers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  local_id int4 UNIQUE,
  name text,
  phone text,
  address text,
  created_at timestamptz DEFAULT now()
);

-- 4. INVOICES
CREATE TABLE IF NOT EXISTS invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  local_id int4 UNIQUE,
  bill_no int4,
  bill_date text,
  customer_name text,
  customer_phone text,
  customer_address text,
  customer_id int4,
  payment_mode text,
  total_amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 5. INVOICE ITEMS
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  local_id int4 UNIQUE,
  invoice_id int4,
  invoice_uuid uuid,
  product_id int4,
  quantity numeric DEFAULT 0,
  price numeric DEFAULT 0,
  gst_rate numeric DEFAULT 0,
  gst_amount numeric DEFAULT 0,
  discount_percent numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0
);

-- 6. HELD BILLS
CREATE TABLE IF NOT EXISTS held_bills (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  local_id int4 UNIQUE,
  label text,
  cart_json text,
  customer_json text,
  created_at timestamptz DEFAULT now()
);

-- 7. OFFERS
CREATE TABLE IF NOT EXISTS offers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  local_id int4 UNIQUE,
  name text,
  status text,
  buy_product_id int4,
  buy_quantity int4,
  free_product_id int4,
  free_quantity int4,
  created_at timestamptz DEFAULT now()
);

-- 8. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  local_id int4 UNIQUE,
  type text,
  title text,
  message text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Done! All tables are ready for syncing.
