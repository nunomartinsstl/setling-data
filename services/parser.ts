import { OrderLineItem, StockItem } from "../types";

export const ParserService = {
  /**
   * Parse CSV-like text into Stock Items
   * Format: SKU, Description, Quantity
   */
  parseStockImport: (text: string): StockItem[] => {
    if (!text.trim()) return [];

    const lines = text.split(/\n/);
    const items: StockItem[] = [];

    lines.forEach(line => {
      // Allow comma or semicolon separators
      const parts = line.split(/[,;]/);
      if (parts.length >= 2) {
        const sku = parts[0].trim();
        // If 2 parts: SKU, Qty. If 3 parts: SKU, Desc, Qty (or swapped)
        // Heuristic: Check which part is a number
        let quantity = 0;
        let description = "Item sem descrição";

        if (parts.length === 2) {
            // Assume SKU, Qty
            const p1 = parseFloat(parts[1].trim());
            if (!isNaN(p1)) {
                quantity = p1;
            }
        } else {
            // Assume SKU, Description, Qty
            description = parts[1].trim();
            const p2 = parseFloat(parts[2].trim());
            if (!isNaN(p2)) quantity = p2;
        }

        if (sku && quantity >= 0) {
            items.push({
                sku,
                description,
                quantity,
                batch: '-', // Default batch for legacy CSV parser
                lastUpdated: new Date().toISOString()
            });
        }
      }
    });

    return items;
  }
};