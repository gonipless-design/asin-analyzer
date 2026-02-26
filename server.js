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

// ── Load or init leads file ──────────────────────────────────────────
function getLeads() {
  if (!fs.existsSync(LEADS_FILE)) return [];
  return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
}
function saveLead(email, firstName, asin, grade) {
  const leads = getLeads();
  leads.push({ email, firstName: firstName || '', asin, grade, date: new Date().toISOString() });
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
}

// ── Send welcome email via Brevo SMTP ────────────────────────────────
async function sendWelcomeEmail(email, firstName, asin, grade, recs) {
  if (!process.env.BREVO_API_KEY) {
    console.log('No BREVO_API_KEY set — skipping email send');
    return;
  }

  const name = firstName || 'Amazon Seller';
  const gradeEmoji = grade === 'A+' || grade === 'A' ? '🟢' : grade === 'B' ? '🔵' : grade === 'C' ? '🟡' : '🔴';

  const recsList = recs ? Object.entries(recs).map(([key, val]) => {
    const labels = { title: 'Title', bullets: 'Bullet Points', description: 'Description/A+', images: 'Images', reviews: 'Reviews' };
    return `<li style="margin-bottom:12px"><strong>${labels[key] || key}:</strong> ${val}</li>`;
  }).join('') : '';

  const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
        
        <!-- HEADER -->
        <tr>
          <td style="background:#0D1B2A;padding:24px 32px;text-align:center">
            <p style="color:#D4AC0D;font-size:13px;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin:0">
              LISTING DOCTOR — AMAZON LISTING ANALYZER
            </p>
          </td>
        </tr>

        <!-- HERO -->
        <tr>
          <td style="background:linear-gradient(135deg,#0D1B2A,#1B4F72);padding:44px 32px;text-align:center">
            <div style="font-size:48px;margin-bottom:16px">${gradeEmoji}</div>
            <h1 style="color:#fff;font-size:28px;font-weight:900;margin:0 0 8px">
              ${name}, your listing scored a <span style="color:#D4AC0D">${grade}</span>
            </h1>
            <p style="color:#A9CCE3;font-size:16px;margin:0">
              ASIN: <strong style="color:#fff">${asin}</strong> — Here's your complete improvement plan
            </p>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:36px 32px">
            <p style="color:#212121;font-size:16px;line-height:1.7;margin:0 0 20px">
              Hey ${name},
            </p>
            <p style="color:#444;font-size:15px;line-height:1.7;margin:0 0 20px">
              Your listing analysis is in. Here's the honest truth: <strong>most Amazon sellers are losing 20–40% of their potential sales because of fixable listing issues.</strong> The good news? You just found out exactly where yours are.
            </p>

            <!-- GRADE BOX -->
            <div style="background:#f7f8fa;border-left:4px solid #D4AC0D;border-radius:0 8px 8px 0;padding:20px 24px;margin:0 0 28px">
              <p style="color:#0D1B2A;font-size:18px;font-weight:800;margin:0 0 4px">Overall Grade: ${grade}</p>
              <p style="color:#666;font-size:13px;margin:0">Every point below is a revenue opportunity you can capture</p>
            </div>

            <!-- RECOMMENDATIONS -->
            ${recsList ? `
            <h3 style="color:#0D1B2A;font-size:17px;font-weight:800;margin:0 0 16px;padding-top:4px;border-top:2px solid #D4AC0D">
              🎯 Your Improvement Plan
            </h3>
            <ul style="color:#444;font-size:14px;line-height:1.6;padding-left:20px;margin:0 0 28px">
              ${recsList}
            </ul>
            ` : ''}

            <!-- URGENCY -->
            <div style="background:#0D1B2A;border-radius:12px;padding:28px;margin:0 0 28px;text-align:center">
              <p style="color:#D4AC0D;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px">
                ⚡ THE CLOCK IS TICKING
              </p>
              <p style="color:#A9CCE3;font-size:15px;line-height:1.65;margin:0 0 20px">
                Every day your listing sits with a suboptimal grade, you're paying Amazon PPC to drive traffic to a page that doesn't convert. That's not a traffic problem. That's a money leak.
              </p>
              <a href="https://asinanalyzer.app?ref=email" style="display:inline-block;padding:14px 32px;background:#D4AC0D;color:#0D1B2A;border-radius:50px;font-size:15px;font-weight:800;text-decoration:none;text-transform:uppercase;letter-spacing:1px">
                Analyze Another ASIN →
              </a>
            </div>

            <p style="color:#888;font-size:13px;line-height:1.6;margin:0">
              Reply to this email with any questions. We read every response.<br>
              — The Listing Doctor Team
            </p>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f4f6f9;padding:20px 32px;text-align:center;border-top:1px solid #e8e8e8">
            <p style="color:#999;font-size:12px;margin:0">
              © 2025 Listing Doctor · <a href="https://asinanalyzer.app" style="color:#1B4F72">asinanalyzer.app</a>
              <br>You're receiving this because you analyzed your listing. No spam, ever.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: 'Listing Doctor', email: process.env.BREVO_SENDER_EMAIL || 'noreply@asinanalyzer.app' },
      to: [{ email, name: name }],
      subject: `${gradeEmoji} Your Amazon Listing Scored a ${grade} — Here's How to Fix It`,
      htmlContent
    }, {
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    console.log(`Welcome email sent to ${email}`);
  } catch (err) {
    console.error('Failed to send welcome email:', err.response?.data || err.message);
  }
}

// ── Fetch Amazon product data ──────────────────────────────────────────
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
    // Try multiple selectors for bullets
    const bulletSelectors = [
      '#feature-bullets li span:not(.aok-hidden)',
      '#feature-bullets .a-list-item',
      '.a-unordered-list.a-vertical .a-list-item'
    ];
    for (const sel of bulletSelectors) {
      $(sel).each((i, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 10) bullets.push(text);
      });
      if (bullets.length > 0) break;
    }
    const description = $('#productDescription').text().trim() ||
                        $('#aplus').text().trim();
    const images = [];
    // Count product images from thumbnail strip
    $('#altImages img').each((i, el) => {
      const src = $(el).attr('src') || '';
      if (src && !src.includes('play-button') && !src.includes('video')) images.push(src);
    });
    if (images.length === 0) {
      $('img[data-a-image-name]').each((i, el) => images.push($(el).attr('src')));
    }
    const ratingText = $('#acrPopover').attr('title') || '';
    const rating = parseFloat(ratingText.match(/[\d.]+/)?.[0] || '0');
    const ratingsText = ($('#acrCustomerReviewText').first().text() || '').trim();
    // Extract first number sequence only (avoid duplicated DOM text)
    const ratingsMatch = ratingsText.match(/([\d,]+)/);
    const ratingsTotal = ratingsMatch ? parseInt(ratingsMatch[1].replace(/,/g, '')) : 0;

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

// ── Score the listing ────────────────────────────────────────────────
function scoreListing(data) {
  const scores = {};
  const recs = {};

  // 1. Title (0-20)
  const titleLen = data.title.length;
  if (titleLen >= 150 && titleLen <= 200) {
    scores.title = 20;
    recs.title = '✅ Title length is optimal (150-200 characters)';
  } else if (titleLen >= 100) {
    scores.title = 14;
    recs.title = `⚠️ Title is ${titleLen} chars. Aim for 150-200 characters. Include primary keyword, brand, key features, and size/quantity.`;
  } else if (titleLen >= 50) {
    scores.title = 8;
    recs.title = `❌ Title is too short (${titleLen} chars). Amazon rewards titles 150-200 characters. Add more keywords and product details.`;
  } else {
    scores.title = 2;
    recs.title = '❌ Title is critically short. This is hurting your search ranking severely.';
  }

  // 2. Bullets (0-20)
  const bulletCount = data.bullets.length;
  const avgBulletLen = bulletCount > 0
    ? data.bullets.reduce((sum, b) => sum + b.length, 0) / bulletCount
    : 0;
  if (bulletCount >= 5 && avgBulletLen >= 100) {
    scores.bullets = 20;
    recs.bullets = '✅ Excellent bullet points — 5 bullets with strong detail';
  } else if (bulletCount >= 5) {
    scores.bullets = 14;
    recs.bullets = '⚠️ You have 5 bullets but they\'re too short. Aim for 150-200 chars each. Lead with the benefit, then the feature.';
  } else if (bulletCount >= 3) {
    scores.bullets = 10;
    recs.bullets = `⚠️ Only ${bulletCount} bullet points. Use all 5. Each bullet should lead with a BENEFIT in ALL CAPS, then explain the feature.`;
  } else {
    scores.bullets = 4;
    recs.bullets = `❌ Only ${bulletCount} bullet points — you're leaving massive conversion on the table. Amazon allows 5 bullets. Fill them all.`;
  }

  // 3. Description / A+ (0-20)
  const descLen = data.description.length;
  if (data.hasAPlus && descLen > 1000) {
    scores.description = 20;
    recs.description = '✅ Strong description/A+ content. This builds trust and boosts conversions.';
  } else if (descLen > 500) {
    scores.description = 13;
    recs.description = '⚠️ Description exists but could be stronger. Consider upgrading to A+ Content (Enhanced Brand Content) — it increases conversions by 5-10%.';
  } else if (descLen > 100) {
    scores.description = 7;
    recs.description = '❌ Thin description. Write 800-1000+ words covering: what it is, who it\'s for, how to use it, FAQs. A+ Content is even better.';
  } else {
    scores.description = 2;
    recs.description = '❌ No meaningful description detected. This is a critical gap. Buyers read descriptions before buying.';
  }

  // 4. Images (0-20)
  const imgCount = Math.max(data.images.length, 1);
  if (imgCount >= 7) {
    scores.images = 20;
    recs.images = `✅ ${imgCount} images — Amazon's algorithm rewards listings with 7+ images`;
  } else if (imgCount >= 5) {
    scores.images = 14;
    recs.images = `⚠️ ${imgCount} images. Add ${7 - imgCount} more. Include: lifestyle shots, infographic, size chart, before/after, packaging.`;
  } else if (imgCount >= 3) {
    scores.images = 8;
    recs.images = `❌ Only ${imgCount} images. You're losing to competitors with 7+. Add lifestyle photos, infographics, and comparison charts.`;
  } else {
    scores.images = 3;
    recs.images = '❌ Critically low image count. Amazon penalizes listings with fewer than 4 images in rankings.';
  }

  // 5. Reviews & Rating (0-20)
  const reviewScore = Math.min(data.ratingsTotal / 100, 1) * 10;
  const ratingScore = data.rating >= 4.5 ? 10 : data.rating >= 4.0 ? 7 : data.rating >= 3.5 ? 4 : 1;
  scores.reviews = Math.round(reviewScore + ratingScore);
  if (scores.reviews >= 18) {
    recs.reviews = `✅ Strong social proof: ${data.ratingsTotal.toLocaleString()} reviews at ${data.rating}★`;
  } else if (scores.reviews >= 12) {
    recs.reviews = `⚠️ ${data.ratingsTotal} reviews at ${data.rating}★. Run a "Request a Review" campaign through Seller Central to boost review velocity.`;
  } else {
    recs.reviews = `❌ Low review count or rating. Consider Amazon Vine Program for new products. Respond to all negative reviews professionally.`;
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

// ── API Routes ──────────────────────────────────────────────────────

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
      // Only preview recs — full recs require email
      preview: {
        title: result.recs.title.substring(0, 50) + '...',
        bullets: result.recs.bullets.substring(0, 50) + '...',
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unlock full report with email (now also accepts firstName)
app.post('/api/unlock', async (req, res) => {
  const { email, asin, firstName } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    const data = await fetchAmazonData(asin.trim().toUpperCase());
    const result = scoreListing(data);

    saveLead(email, firstName, asin, result.grade);
    console.log(`New lead: ${firstName || 'N/A'} | ${email} | ASIN: ${asin} | Grade: ${result.grade}`);

    // Send welcome email asynchronously (don't block response)
    sendWelcomeEmail(email, firstName, asin, result.grade, result.recs).catch(err => {
      console.error('Background email error:', err.message);
    });

    res.json({
      success: true,
      redirect: '/thankyou',
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
app.get('/thankyou', (req, res) => res.sendFile(path.join(__dirname, 'public', 'thankyou.html')));

app.listen(PORT, () => console.log(`ASIN Analyzer running on port ${PORT}`));
