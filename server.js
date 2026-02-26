require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const LEADS_FILE = path.join(__dirname, 'leads.json');

function getLeads() {
  if (!fs.existsSync(LEADS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8')); } catch(e) { return []; }
}
function saveLead(email, firstName, asin, grade) {
  const leads = getLeads();
  leads.push({ email, firstName: firstName || '', asin, grade, date: new Date().toISOString() });
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
}

async function sendWelcomeEmail(email, firstName, asin, grade, recs) {
  const name = firstName || 'Amazon Seller';
  const gradeEmoji = grade === 'A+' || grade === 'A' ? '🟢' : grade === 'B' ? '🔵' : grade === 'C' ? '🟡' : '🔴';

  const labelMap = {
    title: 'Title', bullets: 'Bullet Points', description: 'Description / A+',
    images: 'Images', reviews: 'Reviews & Rating', bsr: 'Best Seller Rank',
    price: 'Price Strategy', qa: 'Q&A Content', video: 'Video Content', brand: 'Brand & A+ Status'
  };

  const recsList = recs ? Object.entries(recs).map(([key, val]) =>
    `<li style="margin-bottom:12px"><strong>${labelMap[key] || key}:</strong> ${val}</li>`
  ).join('') : '';

  const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
<tr><td style="background:#0D1B2A;padding:24px 32px;text-align:center">
  <p style="color:#D4AC0D;font-size:13px;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin:0">LISTING DOCTOR &mdash; AMAZON LISTING ANALYZER</p>
</td></tr>
<tr><td style="background:linear-gradient(135deg,#0D1B2A,#1B4F72);padding:44px 32px;text-align:center">
  <div style="font-size:48px;margin-bottom:16px">${gradeEmoji}</div>
  <h1 style="color:#fff;font-size:26px;font-weight:900;margin:0 0 8px">${name}, your listing just scored a <span style="color:#D4AC0D">${grade}</span></h1>
  <p style="color:#A9CCE3;font-size:15px;margin:0">ASIN: <strong style="color:#fff">${asin}</strong> &mdash; Your full 10-point analysis is below.</p>
</td></tr>
<tr><td style="padding:36px 32px">
  <p style="color:#212121;font-size:16px;line-height:1.7;margin:0 0 20px">Hey ${name},</p>
  <p style="color:#444;font-size:15px;line-height:1.7;margin:0 0 20px">Here is the unfiltered truth: <strong style="color:#212121">most Amazon sellers bleed $3,000-$15,000/month not because their product is bad</strong> but because their listing does not close. Buyers land. They do not buy. Nothing changes until you fix the listing.</p>
  <div style="background:#f7f8fa;border-left:4px solid #D4AC0D;border-radius:0 8px 8px 0;padding:20px 24px;margin:0 0 28px">
    <p style="color:#0D1B2A;font-size:20px;font-weight:900;margin:0 0 4px">Overall Grade: <span style="color:#D4AC0D">${grade}</span></p>
    <p style="color:#666;font-size:13px;margin:0">10 categories analyzed. Every point below is a revenue opportunity.</p>
  </div>
  ${recsList ? `<h3 style="color:#0D1B2A;font-size:16px;font-weight:800;margin:0 0 12px;padding-top:16px;border-top:2px solid #D4AC0D">Your Full Improvement Plan</h3><ul style="color:#444;font-size:14px;line-height:1.7;padding-left:20px;margin:0 0 28px">${recsList}</ul>` : ''}
  <div style="background:#0D1B2A;border-radius:12px;padding:28px;margin:0 0 28px;text-align:center">
    <p style="color:#D4AC0D;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 12px">Do Not Let This Become Another Tab You Get To Later</p>
    <p style="color:#A9CCE3;font-size:15px;line-height:1.65;margin:0 0 20px">Every day your listing sits with a suboptimal grade, you are paying PPC to drive traffic to a page that does not convert. That is your money walking out the door.</p>
    <a href="https://www.asinanalyzer.app?ref=email" style="display:inline-block;padding:14px 32px;background:#D4AC0D;color:#0D1B2A;border-radius:50px;font-size:14px;font-weight:800;text-decoration:none;text-transform:uppercase;letter-spacing:1px">Analyze Another ASIN</a>
  </div>
  <p style="color:#888;font-size:13px;line-height:1.6;margin:0">Got a question? Reply to this email. We read every single one.<br><strong style="color:#666">The Listing Doctor Team</strong></p>
</td></tr>
<tr><td style="background:#f4f6f9;padding:20px 32px;text-align:center;border-top:1px solid #e8e8e8">
  <p style="color:#999;font-size:12px;margin:0">&copy; 2025 Listing Doctor &middot; <a href="https://www.asinanalyzer.app" style="color:#1B4F72">asinanalyzer.app</a><br>You got this because you analyzed a listing. No spam. Unsubscribe anytime.</p>
</td></tr>
</table></td></tr></table></body></html>`;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });
    await transporter.sendMail({
      from: 'Listing Doctor <' + process.env.GMAIL_USER + '>',
      to: email,
      subject: gradeEmoji + ' Your listing scored ' + grade + ' - 10-point analysis inside',
      html: htmlContent
    });
    console.log('Welcome email sent to ' + email);
  } catch (err) {
    console.error('Failed to send welcome email:', err.message);
  }
}

async function fetchAmazonData(asin) {
  if (process.env.RAINFOREST_API_KEY) {
    try {
      const res = await axios.get('https://api.rainforestapi.com/request', {
        params: { api_key: process.env.RAINFOREST_API_KEY, type: 'product', asin: asin, amazon_domain: 'amazon.com' },
        timeout: 15000
      });
      const p = res.data.product;
      return {
        title: p.title || '', bullets: p.feature_bullets || [], description: p.description || '',
        images: p.images || [], rating: p.rating || 0, ratingsTotal: p.ratings_total || 0,
        price: p.buybox_winner?.price?.value || 0, hasAPlus: !!(p.description && p.description.length > 500),
        bsr: p.bestsellers_rank?.[0]?.rank || 0, bsrCategory: p.bestsellers_rank?.[0]?.category || '',
        qaCount: p.answered_questions_count || 0, hasVideo: !!(p.videos && p.videos.length > 0),
        hasBrand: !!(p.brand), source: 'rainforest'
      };
    } catch (e) { console.log('RainforestAPI failed, falling back to scrape'); }
  }

  try {
    const scraperApiKey = process.env.SCRAPER_API_KEY;
    const amazonUrl = 'https://www.amazon.com/dp/' + asin;
    const url = 'https://api.scraperapi.com?api_key=' + scraperApiKey + '&url=' + encodeURIComponent(amazonUrl) + '&render=false';

    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 30000
    });

    const $ = cheerio.load(res.data);

    const title = $('#productTitle').text().trim();
    const bullets = [];
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
    const description = $('#productDescription').text().trim() || $('#aplus').text().trim();
    const hasAPlus = $('#aplus').length > 0 || $('#aplusBrandStory_feature_div').length > 0;

    const images = [];
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
    const ratingsMatch = ratingsText.match(/([\d,]+)/);
    const ratingsTotal = ratingsMatch ? parseInt(ratingsMatch[1].replace(/,/g, '')) : 0;

    // BSR - Best Seller Rank
    let bsr = 0;
    let bsrCategory = '';
    const bsrText = $('#SalesRank, #detailBulletsWrapper_feature_div').text();
    const bsrMatch = bsrText.match(/#([\d,]+)\s+in\s+([^(]+)/);
    if (bsrMatch) {
      bsr = parseInt(bsrMatch[1].replace(/,/g, ''));
      bsrCategory = bsrMatch[2].trim();
    }

    // Price
    const priceText = $('.a-price .a-offscreen').first().text() || 
                      $('#priceblock_ourprice').text() || 
                      $('#priceblock_dealprice').text() || '';
    const priceMatch = priceText.match(/[\d.]+/);
    const price = priceMatch ? parseFloat(priceMatch[0]) : 0;

    // Q&A count
    const qaText = $('#askATFLink, #ask-btf-link, #questions-and-answers').text();
    const qaMatch = qaText.match(/([\d,]+)/);
    const qaCount = qaMatch ? parseInt(qaMatch[1].replace(/,/g, '')) : 0;

    // Video content
    const hasVideo = $('[data-video-url], .videoPlayer, #heroQuickPromoVideo, .av-player').length > 0 ||
                     res.data.includes('videoUrl') || res.data.includes('video-player');

    // Brand registry indicator
    const hasBrand = $('#bylineInfo, #brand').length > 0 || title.toLowerCase().includes('brand');
    const brandName = $('#bylineInfo').text().trim() || '';

    console.log('Scraped - title:', title.substring(0, 50), '| bullets:', bullets.length, '| images:', images.length, '| bsr:', bsr, '| price:', price, '| qa:', qaCount);

    return {
      title, bullets, description, images, rating, ratingsTotal, price,
      hasAPlus, bsr, bsrCategory, qaCount, hasVideo, hasBrand, brandName,
      source: 'scrape'
    };
  } catch (e) {
    throw new Error('Could not fetch Amazon data. Please check the ASIN and try again.');
  }
}

function scoreListing(data) {
  const scores = {};
  const recs = {};

  // 1. Title (0-10)
  const titleLen = data.title.length;
  if (titleLen >= 150 && titleLen <= 200) { scores.title = 10; recs.title = 'Title length is optimal (150-200 characters). Well done.'; }
  else if (titleLen >= 100) { scores.title = 7; recs.title = `Title is ${titleLen} chars. Aim for 150-200. Include primary keyword, brand, key features, and size/quantity.`; }
  else if (titleLen >= 50) { scores.title = 4; recs.title = `Title is too short (${titleLen} chars). Amazon rewards longer titles. Add more keywords and product details.`; }
  else { scores.title = 1; recs.title = 'Title is critically short. This is hurting your search ranking severely. Rewrite it immediately.'; }

  // 2. Bullets (0-10)
  const bulletCount = data.bullets.length;
  const avgBulletLen = bulletCount > 0 ? data.bullets.reduce((sum, b) => sum + b.length, 0) / bulletCount : 0;
  if (bulletCount >= 5 && avgBulletLen >= 100) { scores.bullets = 10; recs.bullets = 'Excellent bullet points - 5 detailed bullets with strong benefit-feature structure.'; }
  else if (bulletCount >= 5) { scores.bullets = 7; recs.bullets = 'You have 5 bullets but they are too short. Aim for 150-200 chars each. Lead with a BENEFIT in CAPS.'; }
  else if (bulletCount >= 3) { scores.bullets = 5; recs.bullets = `Only ${bulletCount} bullets. Use all 5. Each should lead with a BENEFIT in ALL CAPS, then explain the feature.`; }
  else { scores.bullets = 2; recs.bullets = `Only ${bulletCount} bullet points. You are leaving massive conversion on the table. Amazon allows 5 - fill them all.`; }

  // 3. Description / A+ (0-10)
  const descLen = data.description.length;
  if (data.hasAPlus && descLen > 500) { scores.description = 10; recs.description = 'A+ Content detected. This builds trust and boosts conversions by 5-10%. Keep it updated.'; }
  else if (descLen > 500) { scores.description = 7; recs.description = 'Good description length. Upgrade to A+ Content (Enhanced Brand Content) for a 5-10% conversion lift.'; }
  else if (descLen > 100) { scores.description = 4; recs.description = 'Thin description. Write 800-1000+ words covering: what it is, who it is for, how to use it, FAQs.'; }
  else { scores.description = 1; recs.description = 'No meaningful description detected. This is a critical gap. Buyers read descriptions before buying.'; }

  // 4. Images (0-10)
  const imgCount = Math.max(data.images.length, 1);
  if (imgCount >= 7) { scores.images = 10; recs.images = `${imgCount} images - Amazon's algorithm rewards listings with 7+ images. Great job!`; }
  else if (imgCount >= 5) { scores.images = 7; recs.images = `${imgCount} images. Add ${7 - imgCount} more. Include: lifestyle shots, infographic, size chart, before/after.`; }
  else if (imgCount >= 3) { scores.images = 4; recs.images = `Only ${imgCount} images. You are losing to competitors with 7+. Add lifestyle photos and infographics.`; }
  else { scores.images = 1; recs.images = 'Critically low image count. Amazon penalizes listings with fewer than 4 images in search rankings.'; }

  // 5. Reviews & Rating (0-10)
  const reviewScore = Math.min(data.ratingsTotal / 50, 1) * 5;
  const ratingScore = data.rating >= 4.5 ? 5 : data.rating >= 4.0 ? 3.5 : data.rating >= 3.5 ? 2 : 0.5;
  scores.reviews = Math.min(10, Math.round(reviewScore + ratingScore));
  if (scores.reviews >= 9) { recs.reviews = `Strong social proof: ${data.ratingsTotal.toLocaleString()} reviews at ${data.rating} stars. This is a conversion machine.`; }
  else if (scores.reviews >= 6) { recs.reviews = `${data.ratingsTotal} reviews at ${data.rating} stars. Run a Request a Review campaign in Seller Central to boost velocity.`; }
  else { recs.reviews = `Low review count or rating. Use Amazon Vine Program for new products. Respond to ALL negative reviews professionally.`; }

  // 6. BSR - Best Seller Rank (0-10)
  if (data.bsr > 0) {
    if (data.bsr <= 1000) { scores.bsr = 10; recs.bsr = `BSR #${data.bsr.toLocaleString()} - Top 1,000! This is a best seller with massive daily sales volume.`; }
    else if (data.bsr <= 10000) { scores.bsr = 8; recs.bsr = `BSR #${data.bsr.toLocaleString()} - Top 10,000. Strong sales velocity. Keep up PPC and review momentum.`; }
    else if (data.bsr <= 50000) { scores.bsr = 6; recs.bsr = `BSR #${data.bsr.toLocaleString()} - Decent rank. Improving your listing score can push this into the top 10,000.`; }
    else if (data.bsr <= 200000) { scores.bsr = 4; recs.bsr = `BSR #${data.bsr.toLocaleString()} - Sales velocity is low. Optimize your listing and increase PPC spend on high-converting keywords.`; }
    else { scores.bsr = 2; recs.bsr = `BSR #${data.bsr.toLocaleString()} - Very low sales velocity. This listing needs a complete overhaul to compete.`; }
  } else {
    scores.bsr = 5;
    recs.bsr = 'Best Seller Rank not detected. Check Seller Central for your current BSR. BSR under 50,000 indicates healthy sales.';
  }

  // 7. Price Strategy (0-10)
  if (data.price > 0) {
    if (data.price >= 15 && data.price <= 60) { scores.price = 10; recs.price = `Price $${data.price} is in the sweet spot ($15-$60) for impulse purchases and strong ROI on PPC.`; }
    else if (data.price >= 10 && data.price <= 100) { scores.price = 7; recs.price = `Price $${data.price} is reasonable. Test prices in the $15-$60 range for maximum conversion rate.`; }
    else if (data.price < 10) { scores.price = 4; recs.price = `Price $${data.price} is very low. At this price point, PPC profitability is challenging. Consider bundling to increase AOV.`; }
    else { scores.price = 5; recs.price = `Price $${data.price} is premium. Make sure your images and copy justify the price point vs competitors.`; }
  } else {
    scores.price = 5;
    recs.price = 'Price not detected. Ensure your Buy Box is active. A missing price kills conversions entirely.';
  }

  // 8. Q&A Content (0-10)
  if (data.qaCount >= 20) { scores.qa = 10; recs.qa = `${data.qaCount} Q&As - Excellent! Q&As boost keyword indexing and build buyer confidence.`; }
  else if (data.qaCount >= 10) { scores.qa = 7; recs.qa = `${data.qaCount} Q&As. Good start. Ask friends/family to submit common questions to build this out further.`; }
  else if (data.qaCount >= 3) { scores.qa = 5; recs.qa = `Only ${data.qaCount} Q&As. Add more - Q&As contain keywords Amazon indexes and answer buyer objections before they leave.`; }
  else { scores.qa = 2; recs.qa = 'Very few or no Q&As detected. Seed 5-10 common questions. They rank in search and reduce bounce rate.'; }

  // 9. Video Content (0-10)
  if (data.hasVideo) {
    scores.video = 10;
    recs.video = 'Video content detected! Amazon gives significant ranking boosts to listings with video. Keep it updated.';
  } else {
    scores.video = 0;
    recs.video = 'No video detected. Amazon listing videos increase conversion rates by 9.7% on average. Add a 30-90 second product video immediately - this is one of the highest-ROI improvements you can make.';
  }

  // 10. Brand & A+ Status (0-10)
  if (data.hasAPlus && data.hasBrand) {
    scores.brand = 10;
    recs.brand = 'Brand Registry + A+ Content confirmed. You have access to all premium listing features. Make sure to use Brand Story module.';
  } else if (data.hasBrand) {
    scores.brand = 6;
    recs.brand = 'Brand detected but A+ Content not found. Enroll in Brand Registry to unlock A+ Content, Sponsored Brand ads, and Brand Store - all proven to increase sales.';
  } else {
    scores.brand = 3;
    recs.brand = 'No brand registry signals detected. Enrolling in Amazon Brand Registry unlocks A+ Content, Brand Story, Brand Store, and Sponsored Brand campaigns.';
  }

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const pct = Math.round((total / 100) * 100);
  let grade, gradeColor;
  if (pct >= 90) { grade = 'A+'; gradeColor = '#1D8348'; }
  else if (pct >= 80) { grade = 'A'; gradeColor = '#1D8348'; }
  else if (pct >= 70) { grade = 'B'; gradeColor = '#2E86C1'; }
  else if (pct >= 60) { grade = 'C'; gradeColor = '#D4AC0D'; }
  else if (pct >= 50) { grade = 'D'; gradeColor = '#E67E22'; }
  else { grade = 'F'; gradeColor = '#922B21'; }

  return { scores, recs, total: pct, grade, gradeColor };
}

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
      scores: result.scores, total: result.total, grade: result.grade, gradeColor: result.gradeColor,
      preview: {
        title: result.recs.title.substring(0, 60) + '...',
        bullets: result.recs.bullets.substring(0, 60) + '...',
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    sendWelcomeEmail(email, firstName, asin, result.grade, result.recs).catch(err => {
      console.error('Background email error:', err.message);
    });
    res.json({
      success: true, redirect: '/thankyou',
      recs: result.recs, scores: result.scores,
      total: result.total, grade: result.grade, gradeColor: result.gradeColor,
      productTitle: data.title
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/thankyou', (req, res) => res.sendFile(path.join(__dirname, 'public', 'thankyou.html')));

app.listen(PORT, () => console.log('ASIN Analyzer running on port ' + PORT));
