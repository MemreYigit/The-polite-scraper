const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { BookRecordSchema } = require('./schema');

const USER_AGENT = 'FlyRankInternshipA9/1.0 (+https://github.com/MemreYigit/The-polite-scraper)';
const CATALOGUE_URL = 'https://books.toscrape.com/catalogue/page-1.html';
const CACHE_DIR = path.join(__dirname, '..', '..', 'cache');
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'output');
const BOOKS_FILE = path.join(OUTPUT_DIR, 'books.json');
const ERRORS_FILE = path.join(OUTPUT_DIR, 'errors.json');
const RUN_REPORT_FILE = path.join(OUTPUT_DIR, 'run-report.json');

// Counts of real network fetches vs. pages served from cache, across the whole run
const stats = { pagesFetched: 0, cacheHits: 0 };

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

// Fetch a URL, retrying once on a timeout or a 5xx server error.
async function fetchWithRetry(url) {
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let response;
        try {
            response = await fetch(url, {
                headers: {'User-Agent': USER_AGENT},
                signal: AbortSignal.timeout(8000) // 8 seconds timeout
            });
        } catch (err) {
            if (attempt < maxAttempts) {
                console.log(`RETRY - ${url} - ${err.message}`);
                await sleep(1000);
                continue;
            }
            throw err;
        }

        if (response.status === 200) {
            return response;
        }

        if (response.status >= 500 && attempt < maxAttempts) {
            console.log(`RETRY - ${url} - status ${response.status}`);
            await sleep(1000);
            continue;
        }

        throw new Error(`Fetch failed with status: ${response.status}`);
    }
}

// Fetch a page, using cache if available
async function fetchPage(url, cacheFile) {
    if (fs.existsSync(cacheFile)) {
        const html = fs.readFileSync(cacheFile, 'utf-8');
        stats.cacheHits++;
        console.log('CACHE HIT - size:', html.length);
        return html;
    }

    await sleep(500); // Half a second delay

    const response = await fetchWithRetry(url);
    const html = await response.text();

    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile, html);

    stats.pagesFetched++;
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
    // Strip everything except digits and the decimal point (drops the "£"), then parse the number.
    const priceGbp = parseFloat(priceText.replace(/[^0-9.]/g, ''));
    const availabilityText = productMain.find('.availability').text().trim();

    const ratingClasses = productMain.find('.star-rating').attr('class').split(' ');
    const ratingText = ratingClasses.find(cls => ['One', 'Two', 'Three', 'Four', 'Five'].includes(cls)) || null;

    const descriptionEl = $('#product_description + p');
    const description = descriptionEl.length ? descriptionEl.text().trim() : null;

    return {
        title,
        product_url: detailUrl,
        price_text: priceText,
        price_gbp: priceGbp,
        availability_text: availabilityText,
        rating_text: ratingText,
        description,
        source_page: sourcePage,
        fetched_at: new Date().toISOString()
    };
}

// Split records into ones that match BookRecordSchema and ones that don't, with a reason for each failure
function validateRecords(records) {
    const validRecords = [];
    const validErrors = [];

    for (const record of records) {
        const result = BookRecordSchema.safeParse(record);

        if (result.success) {
            validRecords.push(result.data);
        } 
        else {
            const reason = result.error.issues
                .map(issue => `${issue.path.join('.')}: ${issue.message}`)
                .join('; ');
            validErrors.push({ record: record, reason: reason });
        }
    }

    return { validRecords, validErrors };
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
    const startTime = new Date();
    let validRecords = [];
    let validErrors = [];
    const fetchErrors = [];

    try {
        const linkToSourcePage = await getAllBookLinks();
        const records = [];

        for (const [bookUrl, sourcePage] of linkToSourcePage) {
            try {
                const html = await fetchPage(bookUrl, cacheFileForBook(bookUrl));
                const record = extractBookRecord(html, bookUrl, sourcePage);
                records.push(record);
            } catch (err) {
                console.log('SKIPPED - ', bookUrl, '-', err.message);
                fetchErrors.push({ record: { product_url: bookUrl }, reason: err.message });
            }
        }

        ({ validRecords, validErrors } = validateRecords(records));
        const errors = fetchErrors.concat(validErrors);

        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        fs.writeFileSync(BOOKS_FILE, JSON.stringify(validRecords, null, 2));
        fs.writeFileSync(ERRORS_FILE, JSON.stringify(errors, null, 2));

        console.log('--- Sample record ---');
        console.log(validRecords[0]);
        console.log(`detail_pages=${records.length}`);
    } finally {
        const runReport = {
            start_time: startTime.toISOString(),
            duration_ms: new Date() - startTime,
            pages_fetched: stats.pagesFetched,
            cache_hits: stats.cacheHits,
            valid_records: validRecords.length,
            invalid_records: validErrors.length,
            failed_pages: fetchErrors.length
        };

        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        fs.writeFileSync(RUN_REPORT_FILE, JSON.stringify(runReport, null, 2));
    }
}

extractRawRecords()
