import { Order, StockItem } from '../../types';

export interface ShortageItem {
    sku: string;
    description: string;
    totalRequired: number;
    physicalStock: number;
    missing: number;
    status: 'MISSING' | 'EXHAUSTED';
    orders: {
        id: string;
        title: string;
        dateCreated: string;
        reqQty: number;
        creator: string;
    }[];
}

export const calculateShortages = (orders: Order[], stock: StockItem[]): ShortageItem[] => {
    const result: ShortageItem[] = [];
    const demandMap = new Map<string, { desc: string, total: number, orders: any[] }>();

    // Helper to get picked quantity
    const getPickedQty = (order: Order, sku: string) => {
        if (!order.pickedItems || !Array.isArray(order.pickedItems)) return 0;
        return order.pickedItems
            .filter((p: any) => (p.material || '').trim() === sku.trim())
            .reduce((acc: number, p: any) => acc + (Number(p.pickedQty) || 0), 0);
    };

    // 1. Filter Relevant Orders (Active OR Completed with missing items)
    const relevantOrders = orders.filter(o => 
        o.status === 'OPEN' || 
        o.status === 'IN_PROCESS' || 
        o.status === 'IN PROCESS' || 
        o.status === 'COMPLETED'
    );

    // 2. Aggregate Demand
    relevantOrders.forEach(order => {
        if (!order.items) return;
        order.items.forEach(item => {
            // Ignore custom items without SKU for now, as we can't check stock reliably
            if (item.isCustom && !item.sku) return;
            if (item.backorderCreated) return; // Skip if backorder exists
            
            const sku = item.sku;
            const picked = getPickedQty(order, sku);
            const remainingDemand = Math.max(0, item.quantity - picked);

            if (remainingDemand <= 0) return; // Fully satisfied

            if (!demandMap.has(sku)) {
                demandMap.set(sku, { desc: item.description, total: 0, orders: [] });
            }
            const entry = demandMap.get(sku)!;
            entry.total += remainingDemand;
            entry.orders.push({
                id: order.id,
                title: order.title,
                dateCreated: order.dateCreated,
                reqQty: remainingDemand, // Show remaining needed
                creator: order.creator
            });
        });
    });

    // 3. Compare with Stock (Summing duplicate SKUs if multiple locations exist)
    const stockMap = new Map<string, { totalQty: number, desc: string }>();
    
    stock.forEach(s => {
        if (!stockMap.has(s.sku)) {
            stockMap.set(s.sku, { totalQty: 0, desc: s.description });
        }
        const current = stockMap.get(s.sku)!;
        current.totalQty += s.quantity;
    });

    demandMap.forEach((data, sku) => {
        const stockEntry = stockMap.get(sku);
        const physicalStock = stockEntry ? stockEntry.totalQty : 0;
        const description = stockEntry ? stockEntry.desc : data.desc;

        if (data.total > physicalStock) {
            // Critical: Missing Stock
            result.push({
                sku,
                description,
                totalRequired: data.total,
                physicalStock,
                missing: data.total - physicalStock,
                status: 'MISSING',
                orders: data.orders
            });
        } else if (data.total === physicalStock && physicalStock > 0) {
            // Warning: Stock will be exhausted (0)
            result.push({
                sku,
                description,
                totalRequired: data.total,
                physicalStock,
                missing: 0,
                status: 'EXHAUSTED',
                orders: data.orders
            });
        }
    });

    // Sort: MISSING first, then EXHAUSTED. Within group, sort by volume.
    return result.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'MISSING' ? -1 : 1;
        return b.totalRequired - a.totalRequired;
    });
};
