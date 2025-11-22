'use strict';

// Vercel Serverless Function: /api/products
// Returns mock product data with search, retailer filter, sort, and pagination.
// This keeps the SPA functional without exposing any private Sovrn credentials client-side.
// If integrating Sovrn Commerce API, replace the mock generator with a backend fetch using server-side env vars.

module.exports = async function handler(req, res) {
  // Basic CORS and caching
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const url = new URL(req.url, 'http://localhost'); // base ignored by Vercel
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const retailer = (url.searchParams.get('retailer') || '').trim().toLowerCase();
    const sort = (url.searchParams.get('sort') || 'relevance').toLowerCase();
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const perPage = Math.min(48, Math.max(1, parseInt(url.searchParams.get('perPage') || '24', 10)));

    // Generate stable mock dataset
    const seed = (q || 'shop') + '|' + (retailer || '') + '|v1';
    const itemsAll = buildMockProducts(seed, 160);

    // Filter
    let filtered = itemsAll.filter((p) => {
      const matchesQ = q ? (p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) : true;
      const matchesR = retailer ? p.retailer.toLowerCase().includes(retailer) : true;
      return matchesQ && matchesR;
    });

    // Sort
    if (sort === 'price_asc') {
      filtered.sort((a, b) => a.price - b.price);
    } else if (sort === 'price_desc') {
      filtered.sort((a, b) => b.price - a.price);
    } else {
      // relevance: naive ? prioritize title match > category > retailer
      filtered.sort((a, b) => relevanceScore(b, q, retailer) - relevanceScore(a, q, retailer));
    }

    // Pagination
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const pageItems = filtered.slice(start, end);

    // Response
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({
      items: pageItems,
      page,
      perPage,
      total: filtered.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

function relevanceScore(p, q, r) {
  let score = 0;
  if (q) {
    const t = p.title.toLowerCase();
    const c = p.category.toLowerCase();
    if (t.includes(q)) score += 5;
    if (c.includes(q)) score += 2;
  }
  if (r) {
    const rr = p.retailer.toLowerCase();
    if (rr.includes(r)) score += 3;
  }
  return score + Math.random() * 0.1; // slight shuffle for ties
}

function buildMockProducts(seed, count) {
  const rng = mulberry32(hashString(seed));
  const retailers = ['Nordhaus', 'Modernia', 'Everline', 'OX Studio', 'Forma', 'Cortado', 'Linea', 'Alpine', 'Maru', 'Ponto'];
  const categories = ['Apparel', 'Home', 'Tech', 'Beauty', 'Outdoors', 'Fitness', 'Office', 'Kitchen', 'Accessories', 'Footwear'];
  const nouns = ['Jacket', 'Lamp', 'Headphones', 'Serum', 'Tent', 'Kettle', 'Backpack', 'Sneakers', 'Notebook', 'Mug', 'Sunglasses', 'Chair', 'Clock', 'Hoodie', 'Blender'];
  const adjectives = ['Modern', 'Classic', 'Lightweight', 'Compact', 'Premium', 'Minimal', 'Everyday', 'Essential', 'Travel', 'Studio', 'Urban', 'Trail', 'Cozy', 'Bold', 'Clean'];
  const images = [
    'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?q=80&w=1600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1516826957135-700dedea698c?q=80&w=1600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?q=80&w=1600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1511988617509-a57c8a288659?q=80&w=1600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=1600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1478147427282-58a87a120781?q=80&w=1600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1503602642458-232111445657?q=80&w=1600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1491553895911-0055eca6402d?q=80&w=1600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1515955656352-a1fa3ffcd111?q=80&w=1600&auto=format&fit=crop'
  ];

  const items = [];
  for (let i = 0; i < count; i++) {
    const retailer = sample(retailers, rng);
    const category = sample(categories, rng);
    const title = `${sample(adjectives, rng)} ${sample(nouns, rng)}`;
    const price = Math.round((rng() * 180 + 20) * 100) / 100; // $20 - $200
    const currency = 'USD';
    const imageUrl = sample(images, rng) + `&ixid=${Math.floor(rng()*1e6)}&ixlib=rb-4.0.3`;
    const id = `${retailer}-${title}-${i}`.replace(/\s+/g, '-').toLowerCase();
    const productUrl = `https://example.com/r/${encodeURIComponent(retailer)}/${encodeURIComponent(title)}?ref=affiliate`;
    items.push({
      id, title, price, currency, imageUrl, productUrl, retailer, category
    });
  }
  return items;
}

function sample(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

// Simple deterministic PRNG from seed
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

