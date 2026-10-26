const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions/v2");
const axios = require("axios");
const xml2js = require("xml2js");

const SOUNDCLOUD_FEED = "https://feeds.soundcloud.com/users/" +
    "soundcloud:users:164186340/sounds.rss";
const OLD_FEED = "https://firebasestorage.googleapis.com/v0/b/" +
    "czpodcast-f4d9e.appspot.com/o/rss_file.xml?alt=media&" +
    "token=c9a4e50c-f8cd-4130-a148-50b82d15872e";

/**
 * Fetches and parses RSS feed from URL
 * @param {string} feedUrl - URL of the RSS feed
 * @return {Promise} Parsed feed object
 */
async function fetchAndParseFeed(feedUrl) {
    const response = await axios.get(feedUrl);
    const parser = new xml2js.Parser();
    return await parser.parseStringPromise(response.data);
}

/**
 * Enriches old feed items with metadata
 * @param {Array} items - Array of RSS items
 * @return {Array} Enriched items
 */
function enrichOldFeedItems(items) {
    return items.map((item) => {
        // Ensure itunes:author exists
        if (!item["itunes:author"]) {
            item["itunes:author"] = ["CZPodcast"];
        }

        // Add itunes:duration if missing
        if (!item["itunes:duration"] && item.enclosure &&
            item.enclosure[0].$ && item.enclosure[0].$.length) {
            // Rough estimate: 1MB ~ 1 minute for 128kbps MP3
            const lengthInBytes = parseInt(item.enclosure[0].$.length);
            const estimatedMinutes =
                Math.round(lengthInBytes / (1024 * 1024));
            const duration = estimatedMinutes > 0 ?
                `${estimatedMinutes}:00` : "60:00";
            item["itunes:duration"] = [duration];
        }

        // Ensure itunes:summary exists
        if (!item["itunes:summary"] && item.description) {
            item["itunes:summary"] = item.description;
        }

        // Normalize description and summary
        if (!item.description && item["itunes:summary"]) {
            item.description = item["itunes:summary"];
        }

        // Add itunes:image if missing
        if (!item["itunes:image"]) {
            const imageUrl = "https://i1.sndcdn.com/avatars-" +
                "000536756547-j08spn-original.jpg";
            item["itunes:image"] = [{$: {href: imageUrl}}];
        }

        // Ensure enclosure has proper attributes
        if (item.enclosure && item.enclosure[0].$) {
            item.enclosure[0].$.type = "audio/mpeg";
            if (!item.enclosure[0].$.length) {
                item.enclosure[0].$.length = "50000000";
            }
        }

        return item;
    });
}

/**
 * Combines Soundcloud and old RSS feeds
 * @return {Promise<string>} Combined RSS XML
 */
async function combineFeeds() {
    // Fetch both feeds
    const [soundcloudFeed, oldFeed] = await Promise.all([
        fetchAndParseFeed(SOUNDCLOUD_FEED),
        fetchAndParseFeed(OLD_FEED),
    ]);

    // Use Soundcloud feed as the base
    const combinedFeed = soundcloudFeed;
    const channel = combinedFeed.rss.channel[0];

    // Get items from both feeds
    const soundcloudItems = channel.item || [];
    const oldItems = oldFeed.rss && oldFeed.rss.channel &&
        oldFeed.rss.channel[0].item ?
        oldFeed.rss.channel[0].item :
        [];

    // Enrich old feed items
    const enrichedOldItems = enrichOldFeedItems(oldItems);

    // Combine: Soundcloud items first, then enriched old items
    channel.item = [...soundcloudItems, ...enrichedOldItems];

    // Update channel metadata
    channel.title = ["CZPodcast"];
    channel.link = ["https://soundcloud.com/czpodcast-1"];
    channel.description =
        ["Nejpopulárnější podcast pro programátory v Čechách"];
    channel.language = ["cs"];
    channel.lastBuildDate = [new Date().toUTCString()];

    // Build and return XML
    const builder = new xml2js.Builder();
    return builder.buildObject(combinedFeed);
}

exports.rss = onRequest(async (request, response) => {
    try {
        logger.info("RSS invoked");

        const rss = await combineFeeds();

        response.set("Content-Type", "application/rss+xml");
        response.send(rss);
    } catch (error) {
        logger.error("Error generating RSS:", error);
        response.status(500).send("Error generating RSS feed");
    }
});
