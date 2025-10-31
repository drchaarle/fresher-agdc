// Import required packages
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Storage (in-memory, like a temporary database)
const coupons = new Map();
const redemptions = new Map();
let stats = { generated: 0, redeemed: 0, expired: 0 };

// Function to generate secure coupon code
function generateCode(category = 'QC') {
  const time = Date.now().toString().slice(-8);
  const rand = Math.random().toString(36).substring(7).toUpperCase();
  return `${category}-${time}-${rand}`;
}

// ============================================
// API ENDPOINTS (Routes)
// ============================================

// Test endpoint - Check if server is running
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running!',
    time: new Date().toISOString() 
  });
});

// Generate coupons endpoint
app.post('/api/generate-coupons', async (req, res) => {
  try {
    // Get data from user
    const { itemName, itemValue, quantity = 10, expiryDays = 30 } = req.body;
    
    // Check if required data provided
    if (!itemName || !itemValue) {
      return res.status(400).json({ 
        error: 'Please provide itemName and itemValue' 
      });
    }

    const codes = [];
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiryDays);

    // Generate each coupon
    for (let i = 0; i < quantity; i++) {
      const code = generateCode();
      const couponId = uuidv4();
      
      // Store coupon information
      coupons.set(couponId, {
        id: couponId,
        code,
        itemName,
        itemValue,
        status: 'ACTIVE',
        createdAt: new Date(),
        expiryDate,
        redeemed: false,
        redeemedBy: null,
        redeemedAt: null
      });

      codes.push(code);
    }

    stats.generated += quantity;

    // Send response back to user
    res.json({
      success: true,
      message: `Generated ${quantity} coupons successfully`,
      codes,
      expiryDate: expiryDate.toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Redeem coupon endpoint (MOST IMPORTANT - One-time use)
app.post('/api/redeem', (req, res) => {
  try {
    const { code, recipientName } = req.body;

    // Check if code provided
    if (!code) {
      return res.status(400).json({ 
        success: false, 
        error: 'Code is required' 
      });
    }

    // Find the coupon by code
    let foundCoupon = null;
    let foundId = null;

    for (const [id, coupon] of coupons.entries()) {
      if (coupon.code === code) {
        foundCoupon = coupon;
        foundId = id;
        break; // Stop searching when found
      }
    }

    // If coupon not found
    if (!foundCoupon) {
      return res.status(404).json({ 
        success: false, 
        error: 'Coupon not found' 
      });
    }

    // **ONE-TIME USE CHECK** - If already redeemed
    if (foundCoupon.redeemed) {
      return res.status(400).json({ 
        success: false, 
        error: 'Coupon already redeemed - Cannot be used twice!',
        redeemedAt: foundCoupon.redeemedAt,
        redeemedBy: foundCoupon.redeemedBy
      });
    }

    // Check if expired
    if (new Date() > foundCoupon.expiryDate) {
      foundCoupon.status = 'EXPIRED';
      stats.expired++;
      return res.status(400).json({ 
        success: false, 
        error: 'Coupon has expired',
        expiryDate: foundCoupon.expiryDate
      });
    }

    // **REDEEM THE COUPON** - Mark as used
    foundCoupon.redeemed = true;
    foundCoupon.redeemedBy = recipientName || 'Anonymous';
    foundCoupon.redeemedAt = new Date();
    foundCoupon.status = 'REDEEMED';
    stats.redeemed++;

    // Record the redemption
    const redemption = {
      id: uuidv4(),
      couponCode: code,
      itemName: foundCoupon.itemName,
      itemValue: foundCoupon.itemValue,
      recipientName: foundCoupon.redeemedBy,
      redeemedAt: new Date()
    };

    redemptions.set(redemption.id, redemption);

    // Send success response
    res.json({
      success: true,
      message: 'Coupon redeemed successfully!',
      data: {
        itemName: foundCoupon.itemName,
        itemValue: foundCoupon.itemValue,
        recipientName: foundCoupon.redeemedBy,
        redeemedAt: foundCoupon.redeemedAt
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get statistics
app.get('/api/stats', (req, res) => {
  const redemptionRate = stats.generated > 0 
    ? ((stats.redeemed / stats.generated) * 100).toFixed(2) 
    : 0;

  res.json({
    totalGenerated: stats.generated,
    totalRedeemed: stats.redeemed,
    totalExpired: stats.expired,
    redemptionRate: `${redemptionRate}%`,
    inCirculation: stats.generated - stats.redeemed - stats.expired
  });
});

// Get all redemptions
app.get('/api/redemptions', (req, res) => {
  const redemptionsList = Array.from(redemptions.values());
  res.json({
    total: redemptionsList.length,
    redemptions: redemptionsList
  });
});

// Get all active coupons
app.get('/api/coupons', (req, res) => {
  const couponsList = Array.from(coupons.values());
  res.json({
    total: couponsList.length,
    coupons: couponsList
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('✓ Server is RUNNING!');
  console.log(`✓ Port: ${PORT}`);
  console.log(`✓ URL: http://localhost:${PORT}`);
  console.log('═══════════════════════════════════════');
  console.log('');
  console.log('📍 Test endpoints:');
  console.log(`  - Health: http://localhost:${PORT}/api/health`);
  console.log(`  - Stats: http://localhost:${PORT}/api/stats`);
  console.log('');
});
