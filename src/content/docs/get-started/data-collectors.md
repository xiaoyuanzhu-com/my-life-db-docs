---
title: "Data Collectors"
sidebar:
  order: 2
---

MyLifeDB can collect data from many sources across your Apple devices. Data collectors are organized into six categories: Time, Productivity, Health, Diet, Communication, and Content.

Each data source has a status indicating its current availability:

| Status | Meaning |
|--------|---------|
| **Available** | Ready to collect automatically |
| **Limited** | Partial data collection or requires specific setup |
| **Manual** | You enter data yourself |
| **Future** | Planned but not yet implemented |

## Time

### Screen Time
App usage, pickups, and total screen hours.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Total Screen Time | Daily screen usage duration | iPhone | Available |
| Per-App Usage | Time spent in each app | iPhone | Available |
| App Category Usage | Time by category (social, productivity…) | iPhone | Available |
| Phone Pickups | How often you pick up your phone | iPhone | Available |
| Notifications | Notification count by app | iPhone | Available |

### Calendar
Events, meetings, and schedule blocks.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Calendar Events | Meetings, appointments, time blocks | All | Available |
| Meeting Time | Hours in meetings per day/week | All | Available |

## Productivity

### Focus Sessions
Deep work blocks and focus mode tracking.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Focus Mode | Active focus mode and schedule | iPhone, Mac | Limited |
| Deep Work Sessions | Focused uninterrupted work blocks | All | Manual |
| Active App Time | Time per application on Mac | Mac | Limited |

### Developer Work
Git commits, code written, IDE usage.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Git Commits | Commit frequency, repos, LOC changed | Mac | Available |
| Git Activity | Branches, PRs, code review | Mac | Available |
| Terminal History | Shell commands executed | Mac | Available |
| Code Written | Lines of code by language | Mac | Available |
| IDE Usage | Time in Xcode, VS Code, etc. | Mac | Limited |

### AI Chats
Claude, ChatGPT conversation sessions.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| .claude Sessions | Claude Code session history | Mac | Available |

## Health

### Activity
Steps, distance, flights, active energy.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Steps | Daily step count | iPhone, Watch | Available |
| Distance | Walking + running distance | iPhone, Watch | Available |
| Flights Climbed | Floors ascended | iPhone, Watch | Available |
| Active Energy | Calories burned through activity | iPhone, Watch | Available |
| Exercise Minutes | Time spent exercising | iPhone, Watch | Available |
| Stand Hours | Hours with standing activity | Watch | Available |

### Heart & Vitals
Heart rate, HRV, blood oxygen, VO2 max.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Heart Rate | Resting, walking, and workout HR | iPhone, Watch | Available |
| Heart Rate Variability | HRV — stress and recovery indicator | Watch | Available |
| Blood Oxygen | SpO2 saturation level | Watch | Available |
| Respiratory Rate | Breaths per minute during sleep | Watch | Available |
| VO2 Max | Cardio fitness level | Watch | Available |

### Sleep
Duration, stages, bedtime patterns.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Sleep Duration | Total time asleep | iPhone, Watch | Available |
| Sleep Stages | REM, deep, core, awake breakdown | Watch | Available |
| Bedtime & Wake Time | Sleep schedule tracking | iPhone, Watch | Available |
| Sleep Consistency | Schedule regularity score | iPhone | Available |

### Body Metrics
Weight, body composition, walking steadiness.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Body Weight | Weight measurements | iPhone | Available |
| Walking Steadiness | Fall risk assessment | iPhone | Available |

### Mindfulness
Meditation, mood, gratitude, journaling.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Mindful Minutes | Meditation session duration | iPhone, Watch | Available |
| Mood | Emotional state logging | iPhone | Available |
| Mood Journal | Free-text mood entries | All | Manual |
| Gratitude Log | Things you're grateful for | All | Manual |
| Journal Entries | Diary and free writing | All | Manual |

### Workouts
Exercise sessions, routes, running, swimming, cycling.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Workouts | All workout types with duration and calories | iPhone, Watch | Available |
| Workout Routes | GPS tracks for outdoor workouts | iPhone, Watch | Available |
| Running Metrics | Pace, cadence, stride length, power | Watch | Available |
| Swimming | Laps, strokes, distance, SWOLF | Watch | Available |
| Cycling | Distance, speed, power | iPhone, Watch | Available |

## Diet

### Water
Daily hydration tracking.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Water Intake | Daily water consumption | iPhone | Available |

### Caffeine
Coffee and tea consumption.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Caffeine Intake | Coffee and tea consumption tracking | iPhone | Available |

### Meals
What you ate, when, photos.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Meals | What you ate, when, photos | All | Manual |
| Calories Consumed | Dietary energy intake | iPhone | Available |

### Supplements & Alcohol
Vitamins, medications, drinks.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Supplements | Vitamins and medications | All | Manual |
| Alcohol | Drinks consumed | All | Manual |

## Communication

### Messages
iMessage, WhatsApp, Telegram, Discord.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| iMessage | Message count and conversations | iPhone, Mac | Future |
| Chat Logs | WhatsApp, Telegram, Discord, Slack | All | Future |

### Email
Inbox activity and correspondence.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Email Volume | Emails sent and received per day | All | Limited |

### Phone & Video Calls
Call history, duration, FaceTime, Zoom.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Phone Calls | Call frequency and duration | iPhone | Limited |
| Video Calls | FaceTime, Zoom, Meet duration | All | Limited |

### Social Media
Posts, comments, likes across platforms.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Social Media | Posts, comments, likes | All | Future |

## Content

### Articles
Web articles, blogs, newsletters.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Articles Read | Web articles and blog posts | All | Future |

### Videos
YouTube, streaming platforms.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| YouTube History | Videos watched, channels, time | All | Future |
| Movies & TV | What you watched, ratings | All | Manual |

### Podcasts
Audio content and episodes.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Podcasts | Episodes listened, duration, shows | iPhone | Limited |

### Books
Reading progress and highlights.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Books & Reading | Titles, reading time, progress | iPhone | Limited |
| Books Finished | Completed books list | All | Manual |

### Music
Listening history, artists, genres.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Music Listening | Songs, artists, genres, duration | All | Available |

### Photos
Photos taken and screenshots.

| Source | Description | Platform | Status |
|--------|-------------|----------|--------|
| Photos Taken | Photo count per day | iPhone | Available |
| Screenshots | Screenshot frequency | iPhone | Available |
