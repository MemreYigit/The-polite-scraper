const fs = require('fs');
const path = require('path');

const USER_AGENT = 'FlyRankInternshipA9/1.0 (+https://github.com/MemreYigit/The-polite-scraper)';
const CATALOGUE_URL = 'https://books.toscrape.com/catalogue/page-1.html';
const CACHE_DIR = path.join(__dirname, '..', '..', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'catalogue_page_1.html');

async function fetchCataloguePage() {
    if (fs.existsSync(CACHE_FILE)) {
        const html = fs.readFileSync(CACHE_FILE, 'utf-8');
        console.log('CACHE HIT - size:', html.length);
        return;
    }

    const response = await fetch(CATALOGUE_URL, {
        headers: {'User-Agent': USER_AGENT},
        signal: AbortSignal.timeout(8000) // 8 seconds timeout
    });

    if (response.status !== 200) {
        throw new Error(`Fetch failed with status: ${response.status}`);
    }

    const html = await response.text();

    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, html);

    console.log('FETCH - size:', html.length);
}

fetchCataloguePage();