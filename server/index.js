// Dependencies
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const schedule = require('node-schedule');
require('dotenv').config();
const emoji = require('node-emoji');
const express = require('express');
const robot = emoji.get('robot');
const fire = emoji.get('fire');
const wavinghand = emoji.get('wave');
const path = require('path');

// Environment variables
const { TOKEN, API_KEY } = process.env;
const PORT = process.env.PORT || 3001;

// Validation of required environment variables
if (!TOKEN || !PORT || !API_KEY) {
    console.error('Please provide all required environment variables.');
    process.exit(1);
}

// Express server
const app = express();
app.use(express.static(path.join(__dirname, '../client')));

// Routes
app.get('/', (req, res) => {
    res.send('Working fine');
});

// Telegram bot
const bot = new TelegramBot(TOKEN, { polling: true });
const welcomeMessagesSent = new Map();
const waitingForCityInput = new Map();
const userPreferences = new Map();

// Function for sending the welcome message
function sendWelcomeMessage(chatId, firstName, lastName) {
    bot.sendMessage(chatId, `Hi ${firstName.toUpperCase()} ${lastName.toUpperCase()}, Welcome to Weather Bot, Please enter the city name you want to know the weather of.`);
    welcomeMessagesSent.set(chatId, true);
    waitingForCityInput.set(chatId, true);
}

// Function to fetch and send daily weather updates
async function sendDailyWeatherUpdates(chatId, city) {
    try {
        const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city},IN&appid=${API_KEY}`);
        const data = response.data;
        const weather = data.weather[0].description;
        const temperature = data.main.temp - 273.15;
        const message = `Good morning! Here's the daily weather update for ${city}: ${weather} with a temperature of ${temperature.toFixed(2)}°C.`;
        bot.sendMessage(chatId, message);
    } catch (error) {
        console.error('Error fetching weather:', error.message);
        if (error.response) {
            console.error('API Response Data:', error.response.data);
        }
        bot.sendMessage(chatId, "Unable to fetch daily weather update. Please check your preferences.");
    }
}

// Event listener to start the bot
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const lastName = msg.chat.last_name;
    const firstName = msg.chat.first_name;

    if (!welcomeMessagesSent.get(chatId)) {
        sendWelcomeMessage(chatId, firstName, lastName);
    } else {
        bot.sendMessage(chatId, 'Welcome back! Please enter the city name:');
        waitingForCityInput.set(chatId, true);
    }
});

// Event listener for user input
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userName = msg.chat.username;
    const lastName = msg.chat.last_name;
    const firstName = msg.chat.first_name;

    if (!welcomeMessagesSent.get(chatId)) {
        return;
    }

    if (waitingForCityInput.get(chatId)) {
        if (!msg.text) {
            bot.sendMessage(chatId, 'Please enter a valid city name.');
            return;
        }

        const userInput = msg.text.trim();

        try {
            const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${userInput},IN&appid=${API_KEY}`);
            const data = response.data;
            const weather = data.weather[0].description;
            const temperature = data.main.temp - 273.15;
            const city = data.name;
            const humidity = data.main.humidity;
            const pressure = data.main.pressure;
            const windSpeed = data.wind.speed;
            const message = `The weather in ${city} is ${weather} with a temperature of ${temperature.toFixed(2)}°C. The humidity is ${humidity}%, the pressure is ${pressure}hPa, and the wind speed is ${windSpeed}m/s.`;

            bot.sendMessage(chatId, message).then(() => {
                // Ask if the user wants to know the weather update for another city
                bot.sendMessage(chatId, "Do you want to know the weather update for another city?", {
                    reply_markup: {
                        keyboard: [["Yes", "No"]],
                        resize_keyboard: true,
                        one_time_keyboard: true,
                    },
                });
                waitingForCityInput.set(chatId, false);
            });
        } catch (error) {
            console.error('Error:', error.message);
            if (error.response) {
                console.error('API Response Data:', error.response.data);
            }
            bot.sendMessage(chatId, "City doesn't exist.");
        }

        console.log({ "User Name": userName, "Full Name": firstName + " " + lastName, "User Input": userInput });
    } else {
        const answer = msg.text.trim().toLowerCase();

        if (answer === 'yes') {
            bot.sendMessage(chatId, "Please enter the city name:");
            waitingForCityInput.set(chatId, true);
        } else if (answer === 'no') {
            bot.sendMessage(chatId, `I'm shutting down ${robot}, to ${fire} me again, type /start, till then have a nice day! ${wavinghand}`);
            waitingForCityInput.delete(chatId);
        }
    }
});

// Event listener for daily weather updates
bot.onText(/\/dailyupdate/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Please enter your preferred city for daily weather updates:');
    bot.once('message', (locationMsg) => {
        const city = locationMsg.text.trim();
        userPreferences.set(chatId, { city });

        bot.sendMessage(chatId, `Your preferences are set! You will receive weather updates for ${city} daily at 8:00 AM.`);
        scheduleDailyUpdates(chatId, city);
    });
});

// Event listener for stopping daily weather updates
bot.onText(/\/stopdailyupdate/, (msg) => {
    const chatId = msg.chat.id;
    userPreferences.delete(chatId);
    bot.sendMessage(chatId, 'Your daily weather update preferences are unset.');
    unscheduleDailyUpdates(chatId);
});

// Event listener for weather forecast for 3 days
bot.onText(/\/forercast3/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Please enter the city name:');
    bot.once('message', async (locationMsg) => {
        const city = locationMsg.text.trim();
        try {
            const response = await axios.get(`https://api.openweathermap.org/data/2.5/forecast?q=${city},IN&appid=${API_KEY}`);
            const data = response.data;
            const forecast = data.list.splice(0, 24);
            console.log(forecast);
            let message = `Here's the 3-day weather forecast for ${city}:\n`;
            forecast.forEach((item) => {
                const date = new Date(item.dt * 1000);
                const weather = item.weather[0].description;
                const temperature = item.main.temp - 273.15;
                const timing = date.toTimeString().split(' ')[0];
                message += `The temperature on ${date.toDateString()}, at  ${timing} is ${weather} with a temperature of ${temperature.toFixed(2)}°C\n`;
            });

            bot.sendMessage(chatId, message);
        } catch (error) {
            console.error('Error:', error.message);
            if (error.response) {
                console.error('API Response Data:', error.response.data);
            }
            bot.sendMessage(chatId, "City doesn't exist.");
        }
    });
});

// Event listener for weather forecast for 5 days
bot.onText(/\/forercast5/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Please enter the city name:');
    bot.once('message', async (locationMsg) => {
        const city = locationMsg.text.trim();
        try {
            const response = await axios.get(`https://api.openweathermap.org/data/2.5/forecast?q=${city},IN&appid=${API_KEY}`);
            const data = response.data;
            const forecast = data.list.splice(0, 40);
            let message = `Here's the 5-day weather forecast for ${city}:\n`;
            forecast.forEach((item) => {
                const date = new Date(item.dt * 1000);
                const weather = item.weather[0].description;
                const temperature = item.main.temp - 273.15;
                const timing = date.toTimeString().split(' ')[0];
                message += `The temperature on ${date.toDateString()}, at  ${timing} is ${weather} with a temperature of ${temperature.toFixed(2)}°C\n`;
            });

            bot.sendMessage(chatId, message);
        } catch (error) {
            console.error('Error:', error.message);
            if (error.response) {
                console.error('API Response Data:', error.response.data);
            }
            bot.sendMessage(chatId, "City doesn't exist.");
        }
    });
});

// Event listener for Air Quality Index (AQI)
bot.onText(/\/aqi/, (msg) => {
    const chatId = msg.chat.id;
    const aqiMap = new Map([
        [1, 'Good'],
        [2, 'Fair'],
        [3, 'Moderate'],
        [4, 'Poor'],
        [5, 'Very Poor']
    ]);
    bot.sendMessage(chatId, 'Please enter the city name:');
    bot.once('message', async (locationMsg) => {
        const city = locationMsg.text.trim();
        try {
            const coordinatesForCity = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city},IN&appid=${API_KEY}`);
            const coordinates = coordinatesForCity.data.coord;
            const response = await axios.get(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${coordinates.lat}&lon=${coordinates.lon}&appid=${API_KEY}`);

            const data = response.data;
            const aqi = data.list[0].main.aqi;
            let message = `The Air Quality Index (AQI) in ${city} is ${aqi} which is considered as ${aqiMap.get(aqi)}.`;
            bot.sendMessage(chatId, message);
        } catch (error) {
            console.error('Error:', error.message);
            if (error.response) {
                console.error('API Response Data:', error.response.data);
            }
            bot.sendMessage(chatId, "City doesn't exist.");
        }

    });
});

// Schedule daily weather updates for a user
function scheduleDailyUpdates(chatId, city) {
    const jobName = `dailyUpdate-${chatId}`;
    const rule = new schedule.RecurrenceRule();
    rule.hour = 8; // Set the desired hour (24-hour format)
    rule.minute = 0; // Set the desired minute
    rule.tz = 'Asia/Kolkata'; // Set the timezone
    // rule.second = new schedule.Range(0, 59, 5); // 5 seconds interval for testing
    const job = schedule.scheduleJob(jobName, rule, () => {
        sendDailyWeatherUpdates(chatId, city);
    });

    console.log(`Daily weather updates scheduled for ${chatId}`);
}

// Unschedule daily weather updates for a user
function unscheduleDailyUpdates(chatId) {
    const jobName = `dailyUpdate-${chatId}`;
    const job = schedule.scheduledJobs[jobName];

    if (job) {
        job.cancel();
    }

    console.log(`Daily weather updates unscheduled for ${chatId}`);
}

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});