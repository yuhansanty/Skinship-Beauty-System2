// Shared inventory management system
// This file handles data synchronization between purchase orders and inventory

class InventoryManager {
  constructor() {
    this.inventoryData = this.loadInventoryData();
    this.purchaseOrders = this.loadPurchaseOrders();
  }

  // Load inventory data from localStorage or initialize with default data
  loadInventoryData() {
    const defaultData = [
      {id: 'INV-001', name: 'Hair Dye - Blonde', category: 'Hair Products', qty: 25, price: 299, total: 7475, date: '2025-05-15', status: 'in-stock'},
      {id: 'INV-002', name: 'Nail Polish - Red', category: 'Nail Products', qty: 15, price: 150, total: 2250, date: '2025-05-14', status: 'in-stock'},
      {id: 'INV-003', name: 'Facial Cleanser', category: 'Skincare', qty: 8, price: 450, total: 3600, date: '2025-05-13', status: 'low-stock'},
      {id: 'INV-004', name: 'Eyelash Glue', category: 'Lash Products', qty: 30, price: 180, total: 5400, date: '2025-05-12', status: 'in-stock'},
      {id: 'INV-005', name: 'Hair Brush', category: 'Tools', qty: 12, price: 350, total: 4200, date: '2025-05-11', status: 'in-stock'},
      {id: 'INV-006', name: 'Shampoo', category: 'Hair Products', qty: 0, price: 280, total: 0, date: '2025-05-10', status: 'out-of-stock'}
    ];

    const stored = localStorage.getItem('inventoryData');
    return stored ? JSON.parse(stored) : defaultData;
  }

  // Load purchase orders from localStorage or initialize with default data
  loadPurchaseOrders() {
    const defaultData = [
      {
        id: 'PO-2025-001',
        date: '2025-01-15',
        supplier: 'Beauty Supplies Inc.',
        productName: 'Hair Dye - Blonde',
        productId: 'INV-001',
        quantity: 20,
        status: 'pending'
      },
      {
        id: 'PO-2025-002',
        date: '2025-01-14',
        supplier: 'Cosmetic World',
        productName: 'Eyelash Glue',
        productId: 'INV-004',
        quantity: 30,
        status: 'received'
      }
    ];

    const stored = localStorage.getItem('purchaseOrders');
    return stored ? JSON.parse(stored) : defaultData;
  }

  // Save inventory data to localStorage
  saveInventoryData() {
    localStorage.setItem('inventoryData', JSON.stringify(this.inventoryData));
  }

  // Save purchase orders to localStorage
  savePurchaseOrders() {
    localStorage.setItem('purchaseOrders', JSON.stringify(this.purchaseOrders));
  }

  // Add new purchase order
  addPurchaseOrder(poData) {
    this.purchaseOrders.push(poData);
    this.savePurchaseOrders();
    return poData;
  }

  // Update purchase order
  updatePurchaseOrder(index, poData) {
    this.purchaseOrders[index] = poData;
    this.savePurchaseOrders();
  }

  // Delete purchase order
  deletePurchaseOrder(index) {
    this.purchaseOrders.splice(index, 1);
    this.savePurchaseOrders();
  }

  // Toggle purchase order status
  togglePOStatus(index) {
    const po = this.purchaseOrders[index];
    if (po.status === 'pending') {
      po.status = 'received';
      this.updateInventoryFromPO(po);
    } else if (po.status === 'received') {
      po.status = 'pending';
      this.revertInventoryFromPO(po);
    } else {
      po.status = 'pending';
    }
    this.savePurchaseOrders();
    return po;
  }

  // Update inventory when PO is received
  updateInventoryFromPO(po) {
    const inventoryItem = this.inventoryData.find(item => item.id === po.productId);
    
    if (inventoryItem) {
      // Update existing item
      inventoryItem.qty += po.quantity;
      inventoryItem.total = inventoryItem.qty * inventoryItem.price;
      inventoryItem.date = new Date().toISOString().split('T')[0];
      
      // Update status based on quantity
      if (inventoryItem.qty === 0) {
        inventoryItem.status = 'out-of-stock';
      } else if (inventoryItem.qty <= 10) {
        inventoryItem.status = 'low-stock';
      } else {
        inventoryItem.status = 'in-stock';
      }
    } else {
      // Add new item to inventory
      const newItem = {
        id: po.productId,
        name: po.productName,
        category: this.getCategoryFromProductName(po.productName),
        qty: po.quantity,
        price: 0, // Default price, should be set by user
        total: 0,
        date: new Date().toISOString().split('T')[0],
        status: 'in-stock'
      };
      this.inventoryData.push(newItem);
    }
    
    this.saveInventoryData();
    this.notifyInventoryUpdate();
  }

  // Revert inventory when PO status is changed back to pending
  revertInventoryFromPO(po) {
    const inventoryItem = this.inventoryData.find(item => item.id === po.productId);
    
    if (inventoryItem) {
      inventoryItem.qty = Math.max(0, inventoryItem.qty - po.quantity);
      inventoryItem.total = inventoryItem.qty * inventoryItem.price;
      inventoryItem.date = new Date().toISOString().split('T')[0];
      
      // Update status based on quantity
      if (inventoryItem.qty === 0) {
        inventoryItem.status = 'out-of-stock';
      } else if (inventoryItem.qty <= 10) {
        inventoryItem.status = 'low-stock';
      } else {
        inventoryItem.status = 'in-stock';
      }
      
      this.saveInventoryData();
      this.notifyInventoryUpdate();
    }
  }

  // Get category based on product name (simple categorization)
  getCategoryFromProductName(productName) {
    const name = productName.toLowerCase();
    if (name.includes('hair') || name.includes('shampoo') || name.includes('dye')) {
      return 'Hair Products';
    } else if (name.includes('nail') || name.includes('polish')) {
      return 'Nail Products';
    } else if (name.includes('facial') || name.includes('cleanser') || name.includes('skincare')) {
      return 'Skincare';
    } else if (name.includes('lash') || name.includes('eyelash') || name.includes('glue')) {
      return 'Lash Products';
    } else if (name.includes('brush') || name.includes('tool')) {
      return 'Tools';
    }
    return 'Other';
  }

  // Notify other pages about inventory updates
  notifyInventoryUpdate() {
    // Dispatch custom event for inventory updates
    window.dispatchEvent(new CustomEvent('inventoryUpdated', {
      detail: { inventoryData: this.inventoryData }
    }));
  }

  // Get inventory statistics
  getInventoryStats() {
    const totalItems = this.inventoryData.length;
    const totalValue = this.inventoryData.reduce((sum, item) => sum + item.total, 0);
    const lowStock = this.inventoryData.filter(item => item.status === 'low-stock').length;
    const outOfStock = this.inventoryData.filter(item => item.status === 'out-of-stock').length;

    return {
      totalItems,
      totalValue,
      lowStock,
      outOfStock
    };
  }

  // Get purchase order statistics
  getPOStats() {
    const totalPOs = this.purchaseOrders.length;
    const pendingPOs = this.purchaseOrders.filter(po => po.status === 'pending').length;
    const receivedPOs = this.purchaseOrders.filter(po => po.status === 'received').length;
    const totalItems = this.purchaseOrders.reduce((sum, po) => sum + po.quantity, 0);

    return {
      totalPOs,
      pendingPOs,
      receivedPOs,
      totalItems
    };
  }

  // Search inventory items
  searchInventory(searchTerm) {
    return this.inventoryData.filter(item => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  // Search purchase orders
  searchPurchaseOrders(searchTerm) {
    return this.purchaseOrders.filter(po => 
      po.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.supplier.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.productId.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }
}

// Create global instance
window.inventoryManager = new InventoryManager();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = InventoryManager;
}


