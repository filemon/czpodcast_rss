const functions = require("firebase-functions");
const rssCombiner = require("rss-combiner");

const feedConfig = {
    title: "CZPodcast",
    site_url: "https://soundcloud.com/czpodcast-1",
    size: 2000,
    feeds: [
        "https://feeds.soundcloud.com/users/soundcloud:users:164186340/sounds.rss",
        "https://firebasestorage.googleapis.com/v0/b/czpodcast-f4d9e.appspot.com/o/rss_file.xml?alt=media&token=c9a4e50c-f8cd-4130-a148-50b82d15872e",
    ],
    pubDate: new Date(),
};
exports.rss = functions.https.onRequest((request, response) => {
    functions.logger.info("RSS invoked2");
    rssCombiner(feedConfig)
        .then(function(combinedFeed) {
            return combinedFeed.xml();
        }).then((rss) => {
            response.send(rss);
        });
});
