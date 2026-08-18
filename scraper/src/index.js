const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const USER_AGENT = 'FlyRankInternshipA9/1.0 (+https://github.com/MemreYigit/The-polite-scraper)';
const CATALOGUE_URL = 'https://books.toscrape.com/catalogue/page-1.html';
const CACHE_DIR = path.join(__dirname, '..', '..', 'cache');

// Generate a cache file path for a given page number
function cacheFileForPage(pageNumber) {
    return path.join(CACHE_DIR, `catalogue_page_${pageNumber}.html`);
}

// Generate a cache file path for a given book detail page URL
function cacheFileForBook(url) {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    const slug = segments[segments.length - 2];
    return path.join(CACHE_DIR, `book_${slug}.html`);
}

// Sleep for a given number of milliseconds
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch a page, using cache if available
async function fetchPage(url, cacheFile) {
    if (fs.existsSync(cacheFile)) {
        const html = fs.readFileSync(cacheFile, 'utf-8');
        console.log('CACHE HIT - size:', html.length);
        return html;
    }

    await sleep(500); // Half a second delay

    const response = await fetch(url, {
        headers: {'User-Agent': USER_AGENT},
        signal: AbortSignal.timeout(8000) // 8 seconds timeout
    });

    if (response.status !== 200) {
        throw new Error(`Fetch failed with status: ${response.status}`);
    }

    const html = await response.text();

    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile, html);

    console.log('FETCH - size:', html.length);
    return html;
}

// Extract book links from the HTML of a catalogue page
function extractBookLinks(html, pageUrl) {
    const $ = cheerio.load(html);
    const links = [];

    $('.product_pod h3 a').each((i, el) => {
        const href = $(el).attr('href');
        const absoluteUrl = new URL(href, pageUrl);
        links.push(absoluteUrl.href);
    });

    return links;
}

// Find the URL of the next page, if it exists
function findNextPageUrl(html, pageUrl) {
    const $ = cheerio.load(html);
    const nextHref = $('.next a').attr('href');

    if (!nextHref) {
        return null;
    }

    return new URL(nextHref, pageUrl).href;
}

// Extract a raw record from a book detail page's HTML
function extractBookRecord(html, detailUrl, sourcePage) {
    const $ = cheerio.load(html);
    const productMain = $('.product_main'); 

    const title = productMain.find('h1').text().trim();
    const priceText = productMain.find('.price_color').text().trim();
    const availabilityText = productMain.find('.availability').text().trim();

    const ratingClasses = productMain.find('.star-rating').attr('class').split(' ');
    const ratingText = ratingClasses.find(cls => ['One', 'Two', 'Three', 'Four', 'Five'].includes(cls)) || null;

    const descriptionEl = $('#product_description + p');
    const description = descriptionEl.length ? descriptionEl.text().trim() : null;

    return {
        title,
        product_url: detailUrl,
        price_text: priceText,
        availability_text: availabilityText,
        rating_text: ratingText,
        description,
        source_page: sourcePage,
        fetched_at: new Date().toISOString()
    };
}

// Get all book links from the catalogue, handling pagination and caching.
async function getAllBookLinks() {
    const linkToSourcePage = new Map();
    let pageUrl = CATALOGUE_URL;
    let pageNumber = 1;
    const MAX_PAGES = 3;
    let discoveredCount = 0;

    while (pageUrl && pageNumber <= MAX_PAGES) {
        const html = await fetchPage(pageUrl, cacheFileForPage(pageNumber));
        const links = extractBookLinks(html, pageUrl);

        for (const link of links) {
            discoveredCount++;
            linkToSourcePage.set(link, pageUrl);
        }

        pageUrl = findNextPageUrl(html, pageUrl);
        pageNumber++;
    }

    console.log('Catalogue scan completed.');
    console.log(`catalogue_pages=${pageNumber - 1}`);
    console.log(`discovered=${discoveredCount}`);
    console.log(`unique_urls=${linkToSourcePage.size}`);

    return linkToSourcePage;
}

// Fetch, cache, and extract a raw record for every discovered book page
async function extractRawRecords() {
    const linkToSourcePage = await getAllBookLinks();
    const records = [];

    for (const [bookUrl, sourcePage] of linkToSourcePage) {
        const html = await fetchPage(bookUrl, cacheFileForBook(bookUrl));
        const record = extractBookRecord(html, bookUrl, sourcePage);
        records.push(record);
    }

    console.log('--- Sample record ---');
    console.log(records[0]);
    console.log(`detail_pages=${records.length}`);
}

extractRawRecords()
