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

// Main function to scrape multiple pages of the catalogue
async function main() {
    const allLinks = [];
    let pageUrl = CATALOGUE_URL;
    let pageNumber = 1;
    const MAX_PAGES = 3;

    while (pageUrl && pageNumber <= MAX_PAGES) {
        const html = await fetchPage(pageUrl, cacheFileForPage(pageNumber));
        const links = extractBookLinks(html, pageUrl);
        allLinks.push(...links);
        pageUrl = findNextPageUrl(html, pageUrl);
        pageNumber++;
    }

    const uniqueLinks = new Set(allLinks);

    console.log('Scraping completed.');
    console.log(`catalogue_pages=${pageNumber - 1}`);
    console.log(`discovered=${allLinks.length}`);
    console.log(`unique_urls=${uniqueLinks.size}`);
}

main();