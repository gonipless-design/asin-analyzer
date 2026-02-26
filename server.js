require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const LEADS_FILE = path.join(__dirname, 'leads.json');

// â”€â”€ Load or init leads file â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getLeads() {
  if (!fs.existsSync(LEADS_FILE)) return [];
  return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
}
function saveLead(email, asin, grade) {
  const leads = getLeads();
  leads.push({ email, asin, grade, date: new Date().toISOString() });
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
}

// â”€â”€ Fetch Amazon product data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function fetchAmazonData(asin) {
  // Try RainforestAPI if key is available
  if (process.env.RAINFOREST_API_KEY) {
    try {
      const res = await axios.get('https://api.rainforestapi.com/request', {
        params: {
          api_key: process.env.RAINFOREST_API_KEY,
          type: 'product',
          asin: asin,
          amazon_domain: 'amazon.com'
        },
        timeout: 15000
      });
      const p = res.data.product;
      return {
        title: p.title || '',
        bullets: p.feature_bullets || [],
        description: p.description || '',
        images: p.images || [],
        rating: p.rating || 0,
        ratingsTotal: p.ratings_total || 0,
        price: p.buybox_winner?.price?.value || 0,
        hasAPlus: !!(p.description && p.description.length > 500),
        source: 'rainforest'
      };
    } catch (e) {
      console.log('RainforestAPI failed, falling back to scrape');
    }
  }

  // Fallback: scrape Amazon directly
  try {
    const url = `https://www.amazon.com/dp/${asin}`;
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 15000
    });

    const $ = cheerio.load(res.data);

    const title = $('#productTitle').text().trim();
    const bullets = [];
    $('#feature-bullets li span:not(.aok-hidden)').each((i, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 5) bullets.push(text);
    });
    const description = $('#productDescription').text().trim() ||
                        $('#aplus').text().trim();
    const images = [];
    $('img[data-a-image-name]').each((i, el) => images.push($(el).attr('src')));
    const ratingText = $('#acrPopover').attr('title') || '';
    const rating = parseFloat(ratingText.match(/[\d.]+/)?.[0] || '0');
    const ratingsText = $('#acrCustomerReviewText').text();
    const ratingsTotal = parseInt(ratingsText.replace(/[^0-9]/g, '') || '0');

    return {
      title, bullets, description, images,
      rating, ratingsTotal, price: 0,
      hasAPlus: description.length > 500,
      source: 'scrape'
    };
  } catch (e) {
    throw new Error('Could not fetch Amazon data. Please check the ASIN and try again.');
  }
}

// â”€â”€ Score the listing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function scoreListing(data) {
  const scores = {};
  const recs = {};

  // 1. Title (0-20)
  const titleLen = data.title.length;
  const titleWords = data.title.split(' ').length;
  if (titleLen >= 150 && titleLen <= 200) {
    scores.title = 20;
    recs.title = 'âœ… Title length is optimal (150-200 characters)';
  } else if (titleLen >= 100) {
    scores.title = 14;
    recs.title = `âš ï¸ Title is ${titleLen} chars. Aim for 150-200 characters. Include primary keyword, brand, key features, and size/quantity.`;
  } else if (titleLen >= 50) {
    scores.title = 8;
    recs.title = `âŒ Title is too short (${titleLen} chars). Amazon rewards titles 150-200 characters. Add more keywords and product details.`;
  } else {
    scores.title = 2;
    recs.title = 'âŒ Title is critically short. This is hurting your search ranking severely.';
  }

  // 2. Bullets (0-20)
  const bulletCount = data.bullets.length;
  const avgBulletLen = bulletCount > 0
    ? data.bullets.reduce((sum, b) => sum + b.length, 0) / bulletCount
    : 0;
  if (bulletCount >= 5 && avgBulletLen >= 100) {
    scores.bullets = 20;
    recs.bullets = 'âœ… Excellent bullet points â€” 5 bullets with strong detail';
  } else if (bulletCount >= 5) {
    scores.bullets = 14;
    recs.bullets = 'âš ï¸ You have 5 bullets but they\'re too short. Aim for 150-200 chars each. Lead with the benefit, then the feature.';
  } else if (bulletCount >= 3) {
    scores.bullets = 10;
    recs.bullets = `âš ï¸ Only ${bulletCount} bullet points. Use all 5. Each bullet should lead with a BENEFIT in ALL CAPS, then explain the feature.`;
  } else {
    scores.bullets = 4;
    recs.bullets = `âŒ Only ${bulletCount} bullet points â€” you're leaving massive conversion on the table. Amazon allows 5 bullets. Fill them all.`;
  }

  // 3. Description / A+ (0-20)
  const descLen = data.description.length;
  if (data.hasAPlus && descLen > 1000) {
    scores.description = 20;
    recs.description = 'âœ… Strong description/A+ content. This builds trust and boosts conversions.';
  } else if (descLen > 500) {
    scores.description = 13;
    recs.description = 'âš ï¸ Description exists but could be stronger. Consider upgrading to A+ Content (Enhanced Brand Content) â€” it increases conversions by 5-10%.';
  } else if (descLen > 100) {
    scores.description = 7;
    recs.description = 'âŒ Thin description. Write 800-1000+ words covering: what it is, who it\'s for, how to use it, FAQs. A+ Content is even better.';
  } else {
    scores.description = 2;
    recs.description = 'âŒ No meaningful description detected. This is a critical gap. Buyers read descriptions before buying.';
  }

  // 4. Images (0-20)
  const imgCount = Math.max(data.images.length, 1); // at least 1 assumed if listing exists
  if (imgCount >= 7) {
    scores.images = 20;
    recs.images = `âœ… ${imgCount} images â€” Amazon's algorithm rewards listings with 7+ images`;
  } else if (imgCount >= 5) {
    scores.images = 14;
    recs.images = `âš ï¸ ${imgCount} images. Add ${7 - imgCount} more. Include: lifestyle shots, infographic, size chart, before/after, packaging.`;
  } else if (imgCount >= 3) {
    scores.images = 8;
    recs.images = `âŒ Only ${imgCount} images. You're losing to competitors with 7+. Add lifestyle photos, infographics, and comparison charts.`;
  } else {
    scores.images = 3;
    recs.images = 'âŒ Critically low image count. Amazon penalizes listings with fewer than 4 images in rankings.';
  }

  // 5. Reviews & Rating (0-20)
  const reviewScore = Math.min(data.ratingsTotal / 100, 1) * 10;
  const ratingScore = data.rating >= 4.5 ? 10 : data.rating >= 4.0 ? 7 : data.rating >= 3.5 ? 4 : 1;
  scores.reviews = Math.round(reviewScore + ratingScore);
  if (scores.reviews >= 18) {
    recs.reviews = `âœ… Strong social proof: ${data.ratingsTotal.toLocaleString()} reviews at ${data.rating}â˜…`;
  } else if (scores.reviews >= 12) {
    recs.reviews = `âš ï¸ ${data.ratingsTotal} reviews at ${data.rating}â˜…. Run a "Request a Review" campaign through Seller Central to boost review velocity.`;
  } else {
    recs.reviews = `âŒ Low review count or rating. Consider Amazon Vine Program for new products. Respond to all negative reviews professionally.`;
  }

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  let grade, gradeColor;
  if (total >= 90)      { grade = 'A+'; gradeColor = '#1D8348'; }
  else if (total >= 80) { grade = 'A';  gradeColor = '#1D8348'; }
  else if (total >= 70) { grade = 'B';  gradeColor = '#2E86C1'; }
  else if (total >= 60) { grade = 'C';  gradeColor = '#D4AC0D'; }
  else if (total >= 50) { grade = 'D';  gradeColor = '#E67E22'; }
  else                  { grade = 'F';  gradeColor = '#922B21'; }

  return { scores, recs, total, grade, gradeColor };
}

// â”€â”€ API Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Analyze ASIN (returns score + grade, no detailed recs yet)
app.post('/api/analyze', async (req, res) => {
  const { asin } = req.body;
  if (!asin || !/^[A-Z0-9]{10}$/.test(asin.trim().toUpperCase())) {
    return res.status(400).json({ error: 'Invalid ASIN. ASINs are 10 characters (e.g., B08N5WRWNW)' });
  }

  try {
    const data = await fetchAmazonData(asin.trim().toUpperCase());
    const result = scoreListing(data);

    res.json({
      asin: asin.toUpperCase(),
      title: data.title.substring(0, 80) + (data.title.length > 80 ? '...' : ''),
      scores: result.scores,
      total: result.total,
      grade: result.grade,
      gradeColor: result.gradeColor,
      // Only preview recs â€” full recs require email
      preview: {
        title: result.recs.title.substring(0, 50) + '...',
        bullets: result.recs.bullets.substring(0, 50) + '...',
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unlock full report with email
app.post('/api/unlock', async (req, res) => {
  const { email, asin } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    const data = await fetchAmazonData(asin.trim().toUpperCase());
    const result = scoreListing(data);

    saveLead(email, asin, result.grade);
    console.log(`New lead: ${email} | ASIN: ${asin} | Grade: ${result.grade}`);

    res.json({
      success: true,
      recs: result.recs,
      scores: result.scores,
      total: result.total,
      grade: result.grade,
      gradeColor: result.gradeColor,
      productTitle: data.title
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`ASIN Analyzer running on port ${PORT}`));
