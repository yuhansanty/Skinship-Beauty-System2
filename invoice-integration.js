/**
 * Invoice Integration for POS System
 * This file provides functions to integrate invoice generation with your existing POS
 * Include this file in your Cashier.html or POS system
 */

// Firebase configuration (use the same as in invoice.html)
const firebaseConfig = {
  apiKey: "AIzaSyD2Yh7L4Wl9XRlOgxnzZyo8xxds6a02UJY",
  authDomain: "skinship-1ff4b.firebaseapp.com",
  projectId: "skinship-1ff4b",
  storageBucket: "skinship-1ff4b.appspot.com",
  messagingSenderId: "963752770497",
  appId: "1:963752770497:web:8911cc6a375acdbdcc8d40"
};

// Initialize Firebase (only if not already initialized)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const auth = firebase.auth();

/**
 * Generate unique invoice number
 * @returns {Promise<string>} Unique invoice number (e.g., "IV-001")
 */
async function generateInvoiceNumber() {
  try {
    const counterRef = db.collection('metadata').doc('invoiceCounter');
    let newNumber = 1;

    await db.runTransaction(async (tx) => {
      const docSnap = await tx.get(counterRef);
      if (docSnap.exists) {
        newNumber = (docSnap.data().last || 0) + 1;
        tx.update(counterRef, { last: newNumber });
      } else {
        tx.set(counterRef, { last: 1 });
        newNumber = 1;
      }
    });

    return `IV-${String(newNumber).padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating invoice number:', error);
    // Fallback to timestamp-based ID
    return `IV-${Date.now().toString().slice(-3)}`;
  }
}

/**
 * Create invoice from POS sale data
 * @param {Object} saleData - The sale data from your POS
 * @param {string} saleData.customerName - Customer name (optional)
 * @param {string} saleData.customerEmail - Customer email (optional)
 * @param {string} saleData.customerPhone - Customer phone (optional)
 * @param {Array} saleData.items - Array of items sold
 * @param {number} saleData.subtotal - Subtotal before tax
 * @param {number} saleData.taxRate - Tax rate (default 0.12 for 12% VAT)
 * @param {number} saleData.taxAmount - Tax amount
 * @param {number} saleData.discountAmount - Discount amount (optional)
 * @param {number} saleData.grandTotal - Grand total
 * @param {string} saleData.paymentMethod - Payment method (cash, card, gcash, etc.)
 * @param {number} saleData.amountPaid - Amount paid by customer
 * @param {number} saleData.changeGiven - Change given (if cash payment)
 * @returns {Promise<Object>} Created invoice object
 */
async function createInvoiceFromSale(saleData) {
  try {
    // Validate required fields
    if (!saleData.items || !Array.isArray(saleData.items) || saleData.items.length === 0) {
      throw new Error('Sale data must include items array');
    }
    
    if (!saleData.grandTotal || saleData.grandTotal <= 0) {
      throw new Error('Sale data must include valid grand total');
    }

    // Get current user
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User must be authenticated to create invoice');
    }

    // Get user details
    let userFullName = 'Unknown';
    try {
      const userDoc = await db.collection('users').doc(user.uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        userFullName = userData.fullName || userData.email || 'Unknown';
      } else {
        userFullName = user.email || 'Unknown';
      }
    } catch (error) {
      console.warn('Could not load user details:', error);
      userFullName = user.email || 'Unknown';
    }

    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber();
    
    // Calculate tax if not provided
    const taxRate = saleData.taxRate || 0.12; // 12% VAT
    const subtotal = saleData.subtotal || saleData.grandTotal / (1 + taxRate);
    const taxAmount = saleData.taxAmount || (subtotal * taxRate);
    
    // Create invoice object
    const invoice = {
      invoiceNumber: invoiceNumber,
      date: new Date(),
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      customerName: saleData.customerName || 'Walk-in Customer',
      customerEmail: saleData.customerEmail || '',
      customerPhone: saleData.customerPhone || '',
      items: saleData.items.map(item => ({
        name: item.name || 'Unknown Item',
        productId: item.productId || item.id || 'N/A',
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice || item.price || 0,
        total: (item.quantity || 1) * (item.unitPrice || item.price || 0)
      })),
      subtotal: subtotal,
      taxRate: taxRate,
      taxAmount: taxAmount,
      discountAmount: saleData.discountAmount || 0,
      grandTotal: saleData.grandTotal,
      paymentMethod: saleData.paymentMethod || 'cash',
      amountPaid: saleData.amountPaid || saleData.grandTotal,
      changeGiven: saleData.changeGiven || 0,
      status: (saleData.amountPaid || saleData.grandTotal) >= saleData.grandTotal ? 'paid' : 'pending',
      createdBy: userFullName,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastUpdatedBy: userFullName,
      lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Save to Firebase
    const docRef = await db.collection('invoices').add(invoice);
    invoice.id = docRef.id;
    
    console.log('Invoice created successfully:', invoice);
    return invoice;
    
  } catch (error) {
    console.error('Error creating invoice:', error);
    throw error;
  }
}

/**
 * Update invoice status
 * @param {string} invoiceId - Firebase document ID of the invoice
 * @param {string} status - New status (paid, pending, void)
 * @param {string} paymentMethod - Payment method (if status is paid)
 * @returns {Promise<void>}
 */
async function updateInvoiceStatus(invoiceId, status, paymentMethod = null) {
  try {
    const updateData = {
      status: status,
      lastUpdatedBy: auth.currentUser ? auth.currentUser.email : 'Unknown',
      lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if (status === 'paid' && paymentMethod) {
      updateData.paymentMethod = paymentMethod;
    }
    
    await db.collection('invoices').doc(invoiceId).update(updateData);
    console.log('Invoice status updated successfully');
  } catch (error) {
    console.error('Error updating invoice status:', error);
    throw error;
  }
}

/**
 * Get invoice by ID
 * @param {string} invoiceId - Firebase document ID of the invoice
 * @returns {Promise<Object>} Invoice object
 */
async function getInvoiceById(invoiceId) {
  try {
    const doc = await db.collection('invoices').doc(invoiceId).get();
    if (doc.exists) {
      const invoice = doc.data();
      invoice.id = doc.id;
      return invoice;
    } else {
      throw new Error('Invoice not found');
    }
  } catch (error) {
    console.error('Error getting invoice:', error);
    throw error;
  }
}

/**
 * Get all invoices (with optional filters)
 * @param {Object} filters - Optional filters
 * @param {string} filters.status - Filter by status (paid, pending, void)
 * @param {Date} filters.startDate - Filter by start date
 * @param {Date} filters.endDate - Filter by end date
 * @returns {Promise<Array>} Array of invoice objects
 */
async function getInvoices(filters = {}) {
  try {
    let query = db.collection('invoices').orderBy('timestamp', 'desc');
    
    if (filters.status) {
      query = query.where('status', '==', filters.status);
    }
    
    if (filters.startDate) {
      query = query.where('timestamp', '>=', filters.startDate);
    }
    
    if (filters.endDate) {
      query = query.where('timestamp', '<=', filters.endDate);
    }
    
    const snapshot = await query.get();
    const invoices = [];
    
    snapshot.forEach(doc => {
      const invoice = doc.data();
      invoice.id = doc.id;
      invoices.push(invoice);
    });
    
    return invoices;
  } catch (error) {
    console.error('Error getting invoices:', error);
    throw error;
  }
}

/**
 * Example function to integrate with your existing POS sale completion
 * Call this function when a sale is completed in your POS
 * 
 * @param {Object} posSaleData - Your existing POS sale data
 * @returns {Promise<Object>} Created invoice
 */
async function onSaleCompleted(posSaleData) {
  try {
    // Transform your POS data to invoice format
    const invoiceData = {
      customerName: posSaleData.customerName || posSaleData.customer?.name,
      customerEmail: posSaleData.customerEmail || posSaleData.customer?.email,
      customerPhone: posSaleData.customerPhone || posSaleData.customer?.phone,
      items: posSaleData.items || posSaleData.products || posSaleData.services,
      subtotal: posSaleData.subtotal || posSaleData.totalBeforeTax,
      taxRate: posSaleData.taxRate || 0.12,
      taxAmount: posSaleData.taxAmount || posSaleData.tax,
      discountAmount: posSaleData.discountAmount || posSaleData.discount || 0,
      grandTotal: posSaleData.grandTotal || posSaleData.total || posSaleData.finalTotal,
      paymentMethod: posSaleData.paymentMethod || posSaleData.payment?.method,
      amountPaid: posSaleData.amountPaid || posSaleData.payment?.amount,
      changeGiven: posSaleData.changeGiven || posSaleData.payment?.change || 0
    };
    
    // Create the invoice
    const invoice = await createInvoiceFromSale(invoiceData);
    
    // You can also save the sale to a 'sales' collection if needed
    await db.collection('sales').add({
      ...posSaleData,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('Sale completed and invoice created:', invoice);
    return invoice;
    
  } catch (error) {
    console.error('Error processing sale completion:', error);
    throw error;
  }
}

// Export functions for use in your POS system
window.InvoiceIntegration = {
  createInvoiceFromSale,
  generateInvoiceNumber,
  updateInvoiceStatus,
  getInvoiceById,
  getInvoices,
  onSaleCompleted
};

// Example usage in your POS system:
/*
// When a sale is completed in your POS, call:
try {
  const invoice = await InvoiceIntegration.onSaleCompleted({
    customerName: 'John Doe',
    customerEmail: 'john@example.com',
    items: [
      { name: 'Haircut', productId: 'HC-001', quantity: 1, unitPrice: 300 },
      { name: 'Hair Color', productId: 'HC-002', quantity: 1, unitPrice: 500 }
    ],
    subtotal: 800,
    taxAmount: 96,
    grandTotal: 896,
    paymentMethod: 'cash',
    amountPaid: 1000,
    changeGiven: 104
  });
  
  console.log('Invoice created:', invoice.invoiceNumber);
  // Show success message to user
  alert(`Invoice ${invoice.invoiceNumber} created successfully!`);
  
} catch (error) {
  console.error('Failed to create invoice:', error);
  alert('Failed to create invoice. Please try again.');
}
*/
