'use strict';

const request = require("request");
const config = require("./config.json");
let currentTrack = null;
let lastTs = Math.floor(new Date().getTime() / 1000) - 60*60*24;

const Slack = require('slack-node');
let slack = new Slack(config.slack.token);

function fetchLastPlayedTrack() {
	let username = config.lastfm.username;
	let url = "http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks" +
			"&user=" + username +
			"&api_key=" + config.lastfm.apiKey +
			"&format=json",
		data,
		track;

	request(url, function (error, response, body) {
		if (error) {
			console.error(error);
		} else if (response.statusCode != 200) {
			console.error("Unhandled response type:", response.statusCode);
		} else {
			try {
				data = JSON.parse(body);
				if (data.recenttracks && data.recenttracks.track) {
					track = data.recenttracks.track;

					if (Array.isArray(track)) {
						track = track[0];
					}

					checkIfTrackIsPlayingAndNew(track);
				} else if (data.error && data.message) {
					console.error(data.message)
				} else {
					console.error("Unrecognized data", data);
				}

				setTimeout(function () {
					fetchLastPlayedTrack();
				}, 10000);
			} catch (e) {
				console.error(e, body);
			}
		}
	});
}

function checkIfTrackIsPlayingAndNew(track) {
	let trackName;
	// console.dir(track);

	if (track.hasOwnProperty("@attr") &&
		track["@attr"].nowplaying &&
		"true" == track["@attr"].nowplaying) {
		trackName = "\"" + track.name + "\" by " + track.artist["#text"];

		if (currentTrack == null) currentTrack = trackName;
		if (currentTrack != trackName) {
			console.log(trackName);
			setTopicOfSlackChannel(trackName);
			currentTrack = trackName;
		}
	}
}

function removeSelfMessages(onlyTopic, callback) {
	let param = {
		channel: config.slack.channel,
		oldest: lastTs
	};
	slack.api('channels.history', param, (err, res)=>{
		if (err||!res.ok) {
			console.error(err||res);
			if (callback) callback(err||res);
			return;
		}
		let msgs = res.messages.filter(msg=>{
			if (onlyTopic && !msg.topic) return false;
			if (msg.bot_id) {
				if (msg.bot_id != config.slack.bot_id) return false;
			}
			else {
				if (!msg.user || msg.user != config.slack.bot_user_id) return false;
			}
			return true;
		});
		// console.dir(res.messages);
		// console.dir(msgs);
		removeMessages(msgs, callback);
	});
}

function removeMessages(messages, callback) {
	if (messages.length == 0) {
		if (callback) callback(null);
		return;
	}
	let msg = messages.shift();
	let param = {
		channel: config.slack.channel,
		ts: msg.ts,
		as_user: true
	};
	lastTs = Math.max(lastTs, msg.ts);
	console.log(`chat.delete ${msg.ts}`);
	slack.api('chat.delete', param, (err, res)=>{
		if (err||!res.ok) {
			console.error(err||res);
		}
		removeMessages(messages, callback);
	});
}

function setTopicOfSlackChannel(message) {
	let param = {
		channel: config.slack.channel,
		topic: `Last.fm: ${message}`
	};
	// console.dir(param);
	removeSelfMessages(true, ()=>{
		console.log(`channels.setTopic ${param.topic}`);
		slack.api('channels.setTopic', param, (err, res)=>{
			if (err||!res.ok) {
				console.error(err||res);
				return;
			}
		});
	});
}

function sendMessageToSlack(message) {
	let msg = {
		as_user: true,
		username: config.slack.username,
		text: message,
		channel: config.slack.channel,
		link_names: false
	};
	// console.dir(msg);
	slack.api('chat.postMessage', msg, (err, res)=>{
		if (err||!res.ok) {
			console.error(err||res);
			return;
		}
	});
}

removeSelfMessages(false, fetchLastPlayedTrack);
