-- Migration 0001: Add image_key column to products table for product artwork
ALTER TABLE products ADD COLUMN image_key TEXT;
