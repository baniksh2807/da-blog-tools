/* eslint-disable import/no-absolute-path */
/* eslint-disable no-console */
/* eslint-disable eol-last */
/* eslint-disable import/no-unresolved */

// Import SDK for Document Authoring
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

// Base URL for Document Authoring source
const DA_SOURCE = 'https://admin.da.live/source';
const CRON_TAB_PATH = '.helix/crontab.json';
const AEM_PREVIEW_REQUEST_URL = 'https://admin.hlx.page/preview';

// Combine message handling into a single utility
const messageUtils = {
  container: document.querySelector('.message-wrapper'),
  show(text, isError = false) {
    const message = this.container.querySelector('.message');
    message.innerHTML = text.replace(/\r?\n/g, '<br>');
    message.classList.toggle('error', isError);
  },
  setLoading(loading) {
    this.container.classList.toggle('loading', loading);
    this.container.classList.toggle('regular', !loading);
  },
};

/**
 * Shows existing schedules for the current path in the feedback container
 * @param {string} path - Current page path to check schedules for
 * @param {Object} json - Crontab data object
 * @param {Array} json.data - Array of schedule entries
 */
function displaySchedules(path, json) {
  if (!json?.data?.length) {
    messageUtils.show(`No scheduling data available for ${path}`, true);
    return;
  }

  const schedules = json.data.filter((row) => row.command.includes(path));
  if (!schedules.length) {
    messageUtils.show(`No scheduling data available for ${path}`, true);
    return;
  }

  // Get selected timezone for display
  const timezoneSelect = document.getElementById('timezone-select');
  const selectedTimezone = timezoneSelect?.value || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const scheduleList = schedules
    .map((row) => {
      const action = row.command.split(' ')[0];
      const localTime = convertCronTimeToLocal(row.when, selectedTimezone);
      return `${action}ing ${localTime}`;
    })
    .join('\r\n');
  
  messageUtils.show(`Schedules for ${path}:\r\n${scheduleList}`);
}

/**
 * Previews the crontab file
 * @param {string} url - API endpoint URL
 * @param {Object} opts - Request options
 * @param {string} opts.method - HTTP method (POST)
 * @returns {Promise<void>}
 */
async function previewCronTab(url, opts) {
  const newOpts = { ...opts, method: 'POST' };
  const previewReqUrl = url.replace(DA_SOURCE, AEM_PREVIEW_REQUEST_URL).replace(CRON_TAB_PATH, `main/${CRON_TAB_PATH}`);
  try {
    const resp = await fetch(previewReqUrl, newOpts);
    if (!resp.ok) {
      messageUtils.show('Failed to activate schedule , please check console for more details', true);
      return false;
    }
    return true;
  } finally {
    messageUtils.setLoading(false);
  }
}

/**
 * Sends updated scheduling data to the server
 * @param {string} url - API endpoint URL
 * @param {Object} opts - Request options including body and method
 * @param {FormData} opts.body - Form data containing updated schedule
 * @param {string} opts.method - HTTP method (POST)
 * @returns {Promise<Object|null>} Parsed JSON response or null if failed
 */
async function setSchedules(url, opts) {
  // Send request
  try {
    const resp = await fetch(url, opts);
    if (!resp.ok) {
      throw new Error(`Failed to set schedules: ${resp.status}`);
    }
    return resp.json();
  } catch (error) {
    console.error(error.message);
    messageUtils.show('Failed to save schedule, please check console for more details', true);
    return null;
  }
}

// Add the cleanupPastSchedules function near the top with other utility functions
function cleanupPastSchedules(json) {
  if (!json?.data?.length) return json;

  const now = new Date();
  const cleanedData = json.data.filter((schedule) => {
    const match = schedule.when.match(/at (\d+:\d+\s*(?:AM|PM)) on the (\d+)(?:st|nd|rd|th) day of (\w+) in (\d+)/i);
    if (!match) return true;

    const [, timeStr, day, month, year] = match;
    const monthIndex = new Date(`${month} 1, 2000`).getMonth();

    const [hours, minutes] = timeStr.match(/(\d+):(\d+)/).slice(1);
    let hour = parseInt(hours, 10);
    const minute = parseInt(minutes, 10);
    if (timeStr.toUpperCase().includes('PM') && hour < 12) hour += 12;
    if (timeStr.toUpperCase().includes('AM') && hour === 12) hour = 0;

    const scheduleDate = new Date(Date.UTC(
      parseInt(year, 10),
      monthIndex,
      parseInt(day, 10),
      hour,
      minute,
    ));

    return scheduleDate > now;
  });

  return { ...json, data: cleanedData };
}

/**
 * Fetches current scheduling data from the server
 * @param {string} url - API endpoint URL
 * @param {Object} opts - Request options
 * @param {string} opts.method - HTTP method (GET)
 * @param {Object} opts.headers - Request headers including auth token
 * @returns {Promise<Object|null>} Parsed JSON response or null if failed
 */
async function getSchedules(url, opts) {
  try {
    const resp = await fetch(url, opts);
    if (!resp.ok) {
      throw new Error(`Failed to fetch schedules: ${resp.status}`);
    }
    const json = await resp.json();

    // Clean up past schedules before returning
    const cleanedJson = cleanupPastSchedules(json);

    // If schedules were removed, update the crontab
    if (cleanedJson.data.length < json.data.length) {
      const body = new FormData();
      body.append('data', new Blob([JSON.stringify(cleanedJson)], { type: 'application/json' }));

      // Update crontab with cleaned data
      await setSchedules(url, { ...opts, body, method: 'POST' });

      // Preview the changes
      await previewCronTab(url, opts);
    }

    return cleanedJson;
  } catch (error) {
    console.error(error.message);
    messageUtils.show('Failed to fetch, please check console for more details', true);
    return null;
  }
}

// Add timezone utility functions at the top
function populateTimezones() {
  const timezoneSelect = document.getElementById('timezone-select');
  const commonTimezones = [
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'UTC', label: 'UTC' },
    { value: 'Europe/London', label: 'London (GMT)' },
    { value: 'Europe/Paris', label: 'Paris (CET)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
    { value: 'Australia/Sydney', label: 'Sydney (AEST)' }
  ];

  // Detect user's timezone as default
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  commonTimezones.forEach(tz => {
    const option = document.createElement('option');
    option.value = tz.value;
    option.textContent = tz.label;
    if (tz.value === userTimezone) {
      option.selected = true;
    }
    timezoneSelect.appendChild(option);
  });
  
  // If user's timezone not in common list, add it
  if (!commonTimezones.find(tz => tz.value === userTimezone)) {
    const option = document.createElement('option');
    option.value = userTimezone;
    option.textContent = userTimezone;
    option.selected = true;
    timezoneSelect.appendChild(option);
  }
}

// Update the createCronExpression function
function createCronExpression(localDate, timezone) {
  // Create a date in the specified timezone
  const zonedDate = new Date(localDate.toLocaleString('en-US', { timeZone: timezone }));
  
  // Convert to UTC for cron expression
  const utcDate = new Date(localDate.getTime() - (zonedDate.getTime() - localDate.getTime()));
  
  const day = utcDate.getUTCDate();
  const suffix = ['th', 'st', 'nd', 'rd'][(day % 10 > 3 || day < 21) ? 0 : day % 10];

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });

  const monthFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });

  return `at ${timeFormatter.format(utcDate)} on the ${day}${suffix} day of ${
    monthFormatter.format(utcDate)
  } in ${utcDate.getUTCFullYear()}`;
}

// Convert UTC schedule time to local time for display
function convertCronTimeToLocal(cronExpression, displayTimezone = null) {
  const match = cronExpression.match(/at (\d+:\d+\s*(?:AM|PM)) on the (\d+)(?:st|nd|rd|th) day of (\w+) in (\d+)/i);
  if (!match) return cronExpression;
  
  const [, timeStr, day, month, year] = match;
  
  const [hours, minutes] = timeStr.match(/(\d+):(\d+)/).slice(1);
  let hour = parseInt(hours, 10);
  const minute = parseInt(minutes, 10);
  
  if (timeStr.toUpperCase().includes('PM') && hour < 12) hour += 12;
  if (timeStr.toUpperCase().includes('AM') && hour === 12) hour = 0;
  
  const monthIndex = new Date(`${month} 1, 2000`).getMonth();
  
  const utcDate = new Date(Date.UTC(
    parseInt(year, 10),
    monthIndex,
    parseInt(day, 10),
    hour,
    minute
  ));
  
  // Use display timezone or user's local timezone
  const timezone = displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  const localTimeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone
  });
  
  const formattedLocal = localTimeFormatter.format(utcDate);
  const tzAbbr = new Intl.DateTimeFormat('en', { 
    timeZoneName: 'short', 
    timeZone: timezone 
  }).formatToParts(utcDate).find(part => part.type === 'timeZoneName')?.value || '';
  
  return `at ${formattedLocal} ${tzAbbr}`;
}

/**
 * Processes a schedule command by updating the crontab
 * @param {string} url - API endpoint URL
 * @param {Object} opts - Request options
 * @param {string} command - Command type ('preview' or 'publish')
 * @param {string} pagePath - Path of page to schedule
 * @param {string} cronExpression - Schedule expression
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
async function processCommand(url, opts, command, pagePath, cronExpression) {
  if (!cronExpression?.trim()) return false;

  const json = await getSchedules(url, opts);
  if (!json) {
    messageUtils.show(`Please make sure ${CRON_TAB_PATH} is present and is accessible`, true);
    return false;
  }

  const existingCommand = `${command} ${pagePath}`;

  json.data = [
    ...json.data.filter((row) => row.command !== existingCommand),
    { when: cronExpression.trim(), command: existingCommand },
  ];

  const body = new FormData();
  body.append('data', new Blob([JSON.stringify(json)], { type: 'application/json' }));

  const newJson = await setSchedules(url, { ...opts, body, method: 'POST' });
  if (!newJson) return false;

  // Only clear message and show schedules if preview is successful
  const previewSuccess = await previewCronTab(url, opts);
  if (previewSuccess) {
    messageUtils.show('');
    const schedules = await getSchedules(url, opts);
    displaySchedules(pagePath, schedules); // Remove duplicate call and use proper function
    return true;
  }
  return false;
}

// Update showCurrentSchedule function's date parsing logic:
function showCurrentSchedule(path, json) {
  const schedules = json.data.filter((row) => row.command.includes(path));
  const content = document.querySelector('.schedule-content');

  if (schedules.length === 0) {
    content.textContent = 'No active schedules found';
  } else {
    content.innerHTML = '';
    
    // Get selected timezone for display
    const timezoneSelect = document.getElementById('timezone-select');
    const selectedTimezone = timezoneSelect?.value || Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    schedules.forEach((schedule) => {
      const row = document.createElement('div');
      row.className = 'schedule-row';

      const action = document.createElement('div');
      action.className = 'schedule-action';
      const actionText = schedule.command.split(' ')[0];
      action.textContent = actionText.charAt(0).toUpperCase() + actionText.slice(1);

      const time = document.createElement('div');
      time.className = 'schedule-time';

      const localTimeDisplay = convertCronTimeToLocal(schedule.when, selectedTimezone);
      time.textContent = localTimeDisplay.replace('at ', '');

      row.append(action, time);
      content.appendChild(row);
    });
  }
}

// Add validation function for future date/time
function isDateTimeInFuture(dateStr, timeStr, timezone) {
  // Create date in selected timezone
  const selectedDateTime = new Date(`${dateStr}T${timeStr}`);
  
  // Get current time in the selected timezone
  const now = new Date();
  const nowInTimezone = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const timezoneOffset = now.getTime() - nowInTimezone.getTime();
  const adjustedSelectedTime = new Date(selectedDateTime.getTime() + timezoneOffset);
  
  return adjustedSelectedTime > now;
}
/**
 * Initializes the scheduler interface
 * @returns {Promise<void>}
 */
async function init() {
  const { context, token } = await DA_SDK;

  // Populate timezone dropdown
  populateTimezones();

  // Set page path
  const pageInput = document.getElementById('page-path');
  pageInput.value = context.path;

  const customButton = document.querySelector('.custom-button');
  const cronExpressionContainer = document.querySelector('.cron-expression-container');
  const customInput = document.querySelector('.custom-input');
  const dateInput = document.querySelector('#date-input');
  const timeInput = document.querySelector('#time-input');
  const timezoneSelect = document.getElementById('timezone-select');

  // Set current date and time as default values
  const now = new Date();
  const [dateValue] = now.toISOString().split('T');
  dateInput.value = dateValue;
  timeInput.value = now.toTimeString().slice(0, 5);

  // Add timezone change event listener to update schedule display
  timezoneSelect.addEventListener('change', async () => {
    const url = `${DA_SOURCE}/${context.org}/${context.repo}/${CRON_TAB_PATH}`;
    const opts = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
    const json = await getSchedules(url, opts);
    if (json && json.data) {
      showCurrentSchedule(context.path, json);
    }
  });

  // Rest of the existing event listeners...
  customButton.addEventListener('click', () => {
    const isCustom = !cronExpressionContainer.classList.contains('custom-mode');
    cronExpressionContainer.classList.toggle('custom-mode');

    [dateInput, timeInput, customInput].forEach((input) => {
      input.classList.remove('input-empty');
    });

    if (isCustom) {
      customInput.remove();
      cronExpressionContainer.insertBefore(customInput, customButton);
    } else {
      customInput.remove();
      const whenGroup = document.querySelector('.input-group:has(#date-input)');
      whenGroup.appendChild(customInput);
    }
  });

  const docsButton = document.querySelector('.docs-button');
  docsButton.addEventListener('click', () => {
    window.open('https://www.aem.live/docs/scheduling', '_blank');
  });

  const url = `${DA_SOURCE}/${context.org}/${context.repo}/${CRON_TAB_PATH}`;
  const opts = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  const scheduleButton = document.querySelector('.schedule-button');
  scheduleButton.addEventListener('click', async (e) => {
    e.preventDefault();

    const action = document.querySelector('.action-select').value;
    const isCustomMode = cronExpressionContainer.classList.contains('custom-mode');
    const selectedTimezone = timezoneSelect.value;

    [dateInput, timeInput, customInput].forEach((input) => {
      input.classList.remove('input-empty');
    });

    if (isCustomMode) {
      if (!customInput.value) {
        customInput.classList.add('input-empty');
        return;
      }
    } else {
      let hasError = false;
      if (!dateInput.value) {
        dateInput.classList.add('input-empty');
        hasError = true;
      }
      if (!timeInput.value) {
        timeInput.classList.add('input-empty');
        hasError = true;
      }
      if (hasError) return;

      if (!isDateTimeInFuture(dateInput.value, timeInput.value, selectedTimezone)) {
        dateInput.classList.add('input-empty');
        timeInput.classList.add('input-empty');
        messageUtils.show('Please select a future date and time', true);
        return;
      }
    }

    let cronExpression;
    if (isCustomMode) {
      cronExpression = customInput.value;
    } else {
      const inputDateTime = `${dateInput.value}T${timeInput.value}`;
      const localDate = new Date(inputDateTime);
      cronExpression = createCronExpression(localDate, selectedTimezone);
    }

    messageUtils.show('Scheduling page...');
    const success = await processCommand(url, opts, action, context.path, cronExpression);
    if (success) {
      messageUtils.show('');
      const json = await getSchedules(url, opts);
      if (json && json.data) {
        showCurrentSchedule(context.path, json);
      }
    }
  });

  // Check existing schedules
  const json = await getSchedules(url, opts);
  if (json && json.data) {
    showCurrentSchedule(context.path, json);
  }
}

init();
