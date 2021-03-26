const Apify = require('apify');
const { USER_AGENT } = require('./consts');
const csvToJson = require('csvtojson');

const { downloadListOfUrls } = Apify.utils;

const { extractDetail, listPageFunction } = require('./extraction.js');
const { checkDate, checkDateGap, retireBrowser, isObject } = require('./util.js');
const {
    getAttribute, enqueueLinks, addUrlParameters, getWorkingBrowser, fixUrl,
    isFiltered, isMinMaxPriceSet, setMinMaxPrice, isPropertyTypeSet, setPropertyType, enqueueAllPages,
} = require('./util.js');


const { utils: { log, requestAsBrowser, sleep } } = Apify;

/** Main function */
Apify.main(async () => {
    // Actor INPUT variable
    const input = await Apify.getValue('INPUT');
    
    // Actor STATE variable
    const state = await Apify.getValue('STATE') || { crawled: {} };

    // Migrating flag
    let migrating = false;
    Apify.events.on('migrating', () => { migrating = true; });
    
    if (!(input.proxyConfig && input.proxyConfig.useApifyProxy)) {
        throw new Error('This actor cannot be used without Apify proxy.');
    }
    
    const daysInterval = checkDateGap(checkDate(input.checkIn), checkDate(input.checkOut));

    if (daysInterval >= 30) {
        log.warning(`=============
        The selected check-in and check-out dates have ${daysInterval} days between them.
        Some listings won't return available room information!

        Decrease the days interval to fix this
      =============`);
    } else if (daysInterval > 0) {
        log.info(`Using check-in / check-out with an interval of ${daysInterval} days`);
    }

    if (input.minScore) { input.minScore = parseFloat(input.minScore); }
    const sortBy = input.sortBy || 'bayesian_review_score';
    const requestQueue = await Apify.openRequestQueue();

    let startUrl;
    
    /*********   Handle Google Sheet Link             ********* */          
    const [ googlesheet ] = input.googlesheetLink.match(/.*\/spreadsheets\/d\/.*\//);
    const sourceUrl = `${googlesheet}gviz/tq?tqx=out:csv`;
    const response = await requestAsBrowser({ url: sourceUrl, encoding: 'utf8' });

    const rows = await csvToJson().fromString(response.body);
    log.info('Google sheets rows = ' + rows.length);
    let sourcesList=[];
    
    for (let index = 0; index < rows.length; index++) {
        let { url , id } = rows[index];
        sourcesList.push({url, userData: {id,label: 'detail'}});
    }
    let requestList = new Apify.RequestList({
        sources: sourcesList,
    });
    await requestList.initialize();


    const proxyConfiguration = await Apify.createProxyConfiguration({
        ...input.proxyConfig,
    });

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        requestQueue,
        handlePageTimeoutSecs: 120,
        proxyConfiguration,
        launchPuppeteerOptions: {
            headleass : false,
            ignoreHTTPSErrors: true,
            useChrome: Apify.isAtHome(),
            args: [
                '--ignore-certificate-errors',
            ],
            stealth: true,
            stealthOptions: {
                addPlugins: false,
                emulateWindowFrame: false,
                emulateWebGL: false,
                emulateConsoleDebug: false,
                addLanguage: false,
                hideWebDriver: true,
                hackPermissions: false,
                mockChrome: false,
                mockChromeInIframe: false,
                mockDeviceMemory: false,
            },
            userAgent: USER_AGENT,
        },
        launchPuppeteerFunction: async (options) => {
            if (!input.testProxy) {
                return Apify.launchPuppeteer({
                    ...options,
                });
            }

            return getWorkingBrowser(startUrl, input, options);
        },

        handlePageFunction: async ({ page, request, puppeteerPool }) => {
            log.info(`open url(${request.userData.label}): ${await page.url()}`);

            /* // Check if startUrl was open correctly
            if (input.startUrls) {
                const pageUrl = await page.url();
                if (pageUrl.length < request.url.length) {
                    await retireBrowser(puppeteerPool, page, requestQueue, request);
                    return;
                }
            }*/

            // Check if page was loaded with correct currency.
            const curInput = await page.$('input[name="selected_currency"]');
            const currency = await getAttribute(curInput, 'value');

       /*     if (!currency || currency !== input.currency) {
                await retireBrowser(puppeteerPool, page, requestQueue, request);
                throw new Error(`Wrong currency: ${currency}, re-enqueuing...`);
            } */

            if (request.userData.label === 'detail') { // Extract data from the hotel detail page
                // wait for necessary elements
                try { await page.waitForSelector('.hprt-occupancy-occupancy-info'); } catch (e) { log.info('occupancy info not found'); }

                const ldElem = await page.$('script[type="application/ld+json"]');
                const ld = JSON.parse(await getAttribute(ldElem, 'textContent'));
                await Apify.utils.puppeteer.injectJQuery(page);

                // Check if the page was open through working proxy.
                const pageUrl = await page.url();
                if (!input.startUrls && pageUrl.indexOf('label') < 0) {
                    await retireBrowser(puppeteerPool, page, requestQueue, request);
                    return;
                } 
                // Exit if core data is not present or the rating is too low.
                if (!ld || (ld.aggregateRating && ld.aggregateRating.ratingValue <= (input.minScore || 0))) {
                    return;
                }

                // Extract the data.
                log.info('extracting detail...');
                const detail = await extractDetail(page, ld, input, request.userData);
                log.info('detail extracted');
                let userResult = {};

                await Apify.pushData({ ...detail, ...userResult });
            }
        },

        handleFailedRequestFunction: async ({ request }) => {
            log.info(`Request ${request.url} failed too many times`);
            await Apify.pushData({
                '#debug': Apify.utils.createRequestDebugInfo(request),
            });
        },

        gotoFunction: async ({ page, request }) => {
            await Apify.utils.puppeteer.blockRequests(page);

            const cookies = await page.cookies('https://www.booking.com');
            await page.deleteCookie(...cookies);
            await page.setViewport({
                width: 1024 + Math.floor(Math.random() * 100),
                height: 768 + Math.floor(Math.random() * 100),
            });

            return page.goto(request.url, { timeout: 200000 });
        },
    });

    await crawler.run();
});
