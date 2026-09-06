const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const Parser = require("rss-parser");

admin.initializeApp();

const db = admin.firestore();

const parser = new Parser({
  timeout: 12000,
  headers: {
    "User-Agent": "HappyHeadlines/1.0"
  }
});

setGlobalOptions({
  region: "us-central1",
  maxInstances: 10
});

/* --------------------------------------------------
   HAPPYHEADLINES SEASON 1
-------------------------------------------------- */

const SEASON = {
  id: "season-of-light-2026-09",
  name: "Season of Light",
  start: new Date("2026-09-01T00:00:00"),
  end: new Date("2026-10-01T00:00:00"),
  dailyReadingCap: 30,
  streakQualifyingMinutes: 5
};

/* --------------------------------------------------
   APPROVED ARTICLE SOURCES

   These are the only feeds the website requests.
   HappyHeadlines displays original article titles,
   source labels, summaries, and links.

   It does not generate fake news articles.
-------------------------------------------------- */

const APPROVED_RSS_SOURCES = [
  {
    id: "vatican-news",
    label: "Vatican News",
    feed: "https://www.vaticannews.va/en.html?feed=rss2",
    destination: "faith",
    category: "Faith",
    whyHopeful:
      "It shares Catholic life, prayer, service, and the Church’s work around the world."
  },
  {
    id: "good-news-search",
    label: "Google News",
    feed:
      "https://news.google.com/rss/search?q=%22good+news%22+OR+%22community+helps%22+OR+%22volunteers%22&hl=en-US&gl=US&ceid=US:en",
    destination: "home",
    category: "Good News",
    whyHopeful:
      "It highlights people and communities taking constructive, compassionate action."
  },
  {
    id: "peace-and-aid-search",
    label: "Google News",
    feed:
      "https://news.google.com/rss/search?q=%22peace+talks%22+OR+%22humanitarian+aid%22+OR+%22community+rebuilds%22&hl=en-US&gl=US&ceid=US:en",
    destination: "breaking",
    category: "Peace",
    whyHopeful:
      "It focuses on practical help, recovery, dialogue, and care for people experiencing hardship."
  },
  {
    id: "science-search",
    label: "Google News",
    feed:
      "https://news.google.com/rss/search?q=%22medical+breakthrough%22+OR+%22scientists+develop%22+OR+%22research+helps%22&hl=en-US&gl=US&ceid=US:en",
    destination: "home",
    category: "Science",
    whyHopeful:
      "It highlights learning, discovery, healing, and solutions."
  },
  {
    id: "creation-search",
    label: "Google News",
    feed:
      "https://news.google.com/rss/search?q=%22wildlife+recovery%22+OR+%22environmental+restoration%22+OR+%22clean+water+project%22&hl=en-US&gl=US&ceid=US:en",
    destination: "home",
    category: "Creation",
    whyHopeful:
      "It shows people caring for creation and restoring habitats, water, and communities."
  }
];

/* --------------------------------------------------
   CONTENT FILTERS

   This is a starter filter, not a replacement for
   human moderation. You should still review sources
   before making the site public.
-------------------------------------------------- */

const BLOCKED_ARTICLE_TERMS = [
  "porn",
  "sex",
  "nude",
  "nsfw",
  "suicide",
  "murder",
  "massacre",
  "terrorist",
  "bombing",
  "missile",
  "nuclear attack",
  "world war iii",
  "ww3",
  "graphic",
  "execution"
];

const BLOCKED_USERNAME_TERMS = [
  "admin",
  "administrator",
  "moderator",
  "mod",
  "happyheadlines",
  "happyheadline",
  "staff",
  "support",
  "official",
  "pope",
  "vatican",
  "kill",
  "bomb",
  "weapon",
  "hate",
  "sex",
  "nazi",
  "terror",
  "suicide"
];

/* --------------------------------------------------
   HELPER FUNCTIONS
-------------------------------------------------- */

function getChicagoDateKey() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(new Date());
}

function sanitizeText(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeExcerpt(value = "") {
  const cleanedText = sanitizeText(value);

  if (!cleanedText) {
    return "Open the original source to read the publisher’s full report.";
  }

  if (cleanedText.length > 270) {
    return `${cleanedText.slice(0, 267)}…`;
  }

  return cleanedText;
}

function isSuitableArticle(item) {
  const articleText = [
    item.title || "",
    item.contentSnippet || "",
    item.content || ""
  ]
    .join(" ")
    .toLowerCase();

  return !BLOCKED_ARTICLE_TERMS.some((term) => {
    return articleText.includes(term);
  });
}

function makeArticleId(sourceId, item) {
  const uniqueValue =
    item.guid ||
    item.link ||
    item.title ||
    Math.random().toString(36);

  return `${sourceId}_${Buffer.from(uniqueValue)
    .toString("base64url")
    .slice(0, 70)}`;
}

function requireSignedIn(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError(
      "unauthenticated",
      "Please sign in to use this feature."
    );
  }

  return request.auth.uid;
}

function validateUsername(username) {
  const cleanedUsername = String(username || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();

  if (!/^[a-z0-9_]{3,20}$/.test(cleanedUsername)) {
    throw new HttpsError(
      "invalid-argument",
      "Usernames must be 3–20 letters, numbers, or underscores."
    );
  }

  if (
    BLOCKED_USERNAME_TERMS.some((term) => {
      return cleanedUsername.includes(term);
    })
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Please choose another respectful username."
    );
  }

  if (/\d{5,}/.test(cleanedUsername)) {
    throw new HttpsError(
      "invalid-argument",
      "Do not put personal information in a username."
    );
  }

  return cleanedUsername;
}

function fallbackArticles() {
  return [
    {
      id: "official-vatican-news",
      title: "Visit Vatican News for official Catholic news",
      source: "Vatican News",
      url: "https://www.vaticannews.va/en.html",
      category: "Faith",
      excerpt:
        "Open Vatican News to read official reporting about the Pope, the Holy See, and the Church around the world.",
      whyHopeful:
        "It connects readers with official Catholic reporting and the Church’s worldwide work."
    }
  ];
}

/* --------------------------------------------------
   RSS NEWS FEED LOADING
-------------------------------------------------- */

async function loadApprovedSource(source) {
  try {
    const feed = await parser.parseURL(source.feed);

    return (feed.items || [])
      .filter(isSuitableArticle)
      .slice(0, 10)
      .map((item) => {
        return {
          id: makeArticleId(source.id, item),
          title: sanitizeText(item.title || "Untitled article"),
          source: source.label,
          url: item.link,
          category: source.category,
          excerpt: safeExcerpt(
            item.contentSnippet ||
            item.content ||
            ""
          ),
          whyHopeful: source.whyHopeful,
          publishedAt: item.isoDate || item.pubDate || null
        };
      })
      .filter((item) => {
        return item.title && item.url;
      });
  } catch (error) {
    console.error(
      `Could not load source: ${source.id}`,
      error.message
    );

    return [];
  }
}

/* --------------------------------------------------
   DAILY POLLS

   Polls are either:
   - reflection: positive, calm questions
   - fun: harmless "Who is right?" questions
-------------------------------------------------- */

function createDailyPoll(dateKey) {
  const pollChoices = [
    {
      question:
        "Who is right: books before movies, or movies before books?",
      options: [
        "Books before movies",
        "Movies before books",
        "It depends on the story",
        "Both are great"
      ],
      style: "fun"
    },
    {
      question:
        "Who is right: is a rainy day cozy or gloomy?",
      options: [
        "Cozy",
        "Gloomy",
        "Both somehow",
        "Depends if I have hot chocolate"
      ],
      style: "fun"
    },
    {
      question:
        "Which is the best way to enjoy a calm afternoon?",
      options: [
        "Reading",
        "Taking a walk",
        "Listening to music",
        "Making something"
      ],
      style: "reflection"
    },
    {
      question:
        "What kind of happy story gives you the most hope?",
      options: [
        "People helping others",
        "Faith and prayer",
        "Science and medicine",
        "Nature recovering"
      ],
      style: "reflection"
    },
    {
      question:
        "Who is right: should Christmas music begin in November or December?",
      options: [
        "November",
        "After Thanksgiving",
        "December",
        "Whenever it brings joy"
      ],
      style: "fun"
    }
  ];

  const numberOnly = Number(
    dateKey.replaceAll("-", "")
  );

  const chosenPoll =
    pollChoices[numberOnly % pollChoices.length];

  return {
    id: `daily-${dateKey}`,
    ...chosenPoll
  };
}

/* --------------------------------------------------
   SAINT OF THE DAY STARTER DATA

   This starter list covers important September
   observances. Expand this later with a reviewed,
   full Catholic calendar source.
-------------------------------------------------- */

function getSaintOfDay(dateKey) {
  const saintDays = {
    "09-05": {
      name: "Saint Teresa of Calcutta",
      liturgicalSeason:
        "CATHOLIC CALENDAR · ORDINARY TIME",
      description:
        "Saint Teresa of Calcutta, often called Mother Teresa, served people who were poor, sick, lonely, and forgotten. Her life became a witness to practical love and mercy.",
      lesson:
        "Small acts done with great love can bring light to another person’s day."
    },

    "09-08": {
      name: "The Nativity of the Blessed Virgin Mary",
      liturgicalSeason:
        "CATHOLIC CALENDAR · FEAST",
      description:
        "The Church celebrates the birth of the Blessed Virgin Mary, the mother of Jesus.",
      lesson:
        "God often begins great works quietly, through faithful people and everyday moments."
    },

    "09-14": {
      name: "The Exaltation of the Holy Cross",
      liturgicalSeason:
        "CATHOLIC CALENDAR · FEAST",
      description:
        "This feast invites Christians to remember Christ’s self-giving love and the hope found in the Cross.",
      lesson:
        "Love can remain strong even in difficult times."
    },

    "09-15": {
      name: "Our Lady of Sorrows",
      liturgicalSeason:
        "CATHOLIC CALENDAR · MEMORIAL",
      description:
        "The Church remembers Mary’s faithfulness and compassion in suffering.",
      lesson:
        "Compassion means staying close to people who are hurting."
    },

    "09-21": {
      name: "Saint Matthew, Apostle and Evangelist",
      liturgicalSeason:
        "CATHOLIC CALENDAR · FEAST",
      description:
        "Saint Matthew left his old life to follow Jesus and later shared the Gospel.",
      lesson:
        "A new beginning is always possible."
    },

    "09-27": {
      name: "Saint Vincent de Paul",
      liturgicalSeason:
        "CATHOLIC CALENDAR · MEMORIAL",
      description:
        "Saint Vincent de Paul dedicated his life to serving people experiencing poverty and inspired generations of charitable work.",
      lesson:
        "Faith becomes visible when we notice needs and help."
    },

    "09-29": {
      name:
        "Saints Michael, Gabriel, and Raphael, Archangels",
      liturgicalSeason:
        "CATHOLIC CALENDAR · FEAST",
      description:
        "The Church celebrates the archangels Michael, Gabriel, and Raphael, remembered in Scripture as servants and messengers of God.",
      lesson:
        "God’s care can come through protection, guidance, healing, and good news."
    }
  };

  const monthAndDay = dateKey.slice(5);

  return (
    saintDays[monthAndDay] || {
      name: "Saint of the Day",
      liturgicalSeason:
        "CATHOLIC CALENDAR · ORDINARY TIME",
      description:
        "Today’s Catholic observance can be explored through a trusted Catholic calendar or the official readings for the day.",
      lesson:
        "Choose one small act of faith, mercy, patience, or encouragement today."
    }
  );
}

/* --------------------------------------------------
   FUNCTION: GET REAL NEWS FEEDS

   The feed is cached in Firestore for 15 minutes.
   This reduces requests to RSS publishers and helps
   keep the site fast.
-------------------------------------------------- */

exports.getHappyFeed = onCall(async () => {
  const cacheReference = db
    .collection("feedCache")
    .doc("current");

  const cachedFeed = await cacheReference.get();

  if (cachedFeed.exists) {
    const cacheData = cachedFeed.data();

    const lastUpdateMilliseconds =
      cacheData.updatedAt?.toMillis?.() || 0;

    const cacheAge = Date.now() - lastUpdateMilliseconds;

    if (cacheAge < 15 * 60 * 1000) {
      return cacheData.payload;
    }
  }

  const articleSets = await Promise.all(
    APPROVED_RSS_SOURCES.map(loadApprovedSource)
  );

  const sourceResults = {};

  APPROVED_RSS_SOURCES.forEach((source, index) => {
    sourceResults[source.id] = articleSets[index];
  });

  const homeArticles = [
    ...(sourceResults["good-news-search"] || []),
    ...(sourceResults["science-search"] || []),
    ...(sourceResults["creation-search"] || [])
  ].slice(0, 15);

  const faithArticles =
    sourceResults["vatican-news"] || [];

  const breakingArticles =
    sourceResults["peace-and-aid-search"] || [];

  const dateKey = getChicagoDateKey();

  const generatedPoll = createDailyPoll(dateKey);

  const pollReference = db
    .collection("polls")
    .doc(generatedPoll.id);

  const existingPoll = await pollReference.get();

  if (!existingPoll.exists) {
    await pollReference.set({
      ...generatedPoll,
      votes: {},
      createdAt:
        admin.firestore.FieldValue.serverTimestamp()
    });
  }

  const savedPoll = (
    await pollReference.get()
  ).data();

  const communityReference = db
    .collection("community")
    .doc(SEASON.id);

  const communityDocument =
    await communityReference.get();

  if (!communityDocument.exists) {
    await communityReference.set({
      goalMinutes: 5000,
      currentMinutes: 0,
      description:
        "Together, let’s read 5,000 calm and hopeful minutes during Season of Light.",
      seasonId: SEASON.id
    });
  }

  const communityChallenge = (
    await communityReference.get()
  ).data();

  const payload = {
    home:
      homeArticles.length > 0
        ? homeArticles
        : fallbackArticles(),

    faith:
      faithArticles.length > 0
        ? faithArticles
        : fallbackArticles(),

    breaking:
      breakingArticles.length > 0
        ? breakingArticles
        : fallbackArticles(),

    poll: {
      id: savedPoll.id,
      question: savedPoll.question,
      options: savedPoll.options,
      style: savedPoll.style,
      votes: savedPoll.votes || {}
    },

    communityChallenge,

    saintOfDay: getSaintOfDay(dateKey)
  };

  await cacheReference.set({
    payload,
    updatedAt:
      admin.firestore.FieldValue.serverTimestamp()
  });

  return payload;
});

/* --------------------------------------------------
   FUNCTION: AWARD ACTIVE READING MINUTE

   - One point per active minute
   - 30 reading-point cap every day
   - At minute 5, qualify for the daily streak
   - Streak bonus equals the current streak number
   - Points go to both Career Points and Season Points
-------------------------------------------------- */

exports.awardReadingMinute = onCall(async (request) => {
  const userId = requireSignedIn(request);

  const clientDate = request.data?.clientDate;
  const serverDate = getChicagoDateKey();

  if (clientDate !== serverDate) {
    throw new HttpsError(
      "failed-precondition",
      "Your device date does not match the server date."
    );
  }

  const userReference = db
    .collection("users")
    .doc(userId);

  const scoreReference = db
    .collection("seasonScores")
    .doc(`${SEASON.id}_${userId}`);

  const communityReference = db
    .collection("community")
    .doc(SEASON.id);

  const transactionResult = await db.runTransaction(
    async (transaction) => {
      const userDocument = await transaction.get(
        userReference
      );

      if (!userDocument.exists) {
        throw new HttpsError(
          "not-found",
          "Your profile was not found."
        );
      }

      const user = userDocument.data();

      const isNewDay =
        user.todayDate !== serverDate;

      const previousMinutes = isNewDay
        ? 0
        : Number(user.todayReadingMinutes || 0);

      const previousPoints = isNewDay
        ? 0
        : Number(user.todayPoints || 0);

      const previousBonus = isNewDay
        ? 0
        : Number(user.todayStreakBonus || 0);

      if (previousMinutes >= SEASON.dailyReadingCap) {
        return {
          updatedProfile: {
            ...user,
            todayDate: serverDate,
            todayReadingMinutes: previousMinutes,
            todayPoints: previousPoints,
            todayStreakBonus: previousBonus
          },

          message:
            "You reached today’s 30-minute reading-point cap. Your calm time still matters."
        };
      }

      const nextMinutes = previousMinutes + 1;

      let streakBonus = 0;

      let nextCurrentStreak = Number(
        user.currentStreak || 0
      );

      let nextLongestStreak = Number(
        user.longestStreak || 0
      );

      let lastQualifiedDate =
        user.lastQualifiedDate || null;

      let message = "";

      if (
        nextMinutes === SEASON.streakQualifyingMinutes &&
        previousBonus === 0
      ) {
        const yesterday = new Date();

        yesterday.setDate(yesterday.getDate() - 1);

        const yesterdayKey = new Intl.DateTimeFormat(
          "en-CA",
          {
            timeZone: "America/Chicago",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
          }
        ).format(yesterday);

        nextCurrentStreak =
          lastQualifiedDate === yesterdayKey
            ? nextCurrentStreak + 1
            : 1;

        nextLongestStreak = Math.max(
          nextLongestStreak,
          nextCurrentStreak
        );

        streakBonus = nextCurrentStreak;

        lastQualifiedDate = serverDate;

        message =
          `Five peaceful minutes complete. ` +
          `Your ${nextCurrentStreak}-day streak added ` +
          `${nextCurrentStreak} bonus point` +
          `${nextCurrentStreak === 1 ? "" : "s"}.`;
      }

      const totalPointsEarned =
        1 + streakBonus;

      const nextCareerPoints =
        Number(user.careerPoints || 0) +
        totalPointsEarned;

      const nextSeasonPoints =
        Number(user.currentSeasonPoints || 0) +
        totalPointsEarned;

      const nextTodayPoints =
        previousPoints + totalPointsEarned;

      const badges = new Set(
        user.badges || ["first-step"]
      );

      badges.add("first-step");

      if (nextCurrentStreak >= 7) {
        badges.add("seven-days");
      }

      if (nextCurrentStreak >= 14) {
        badges.add("peace-builder");
      }

      if (nextCurrentStreak >= 30) {
        badges.add("light-bearer");
      }

      const profileUpdate = {
        todayDate: serverDate,
        todayReadingMinutes: nextMinutes,
        todayPoints: nextTodayPoints,

        todayStreakBonus:
          previousBonus + streakBonus,

        careerPoints: nextCareerPoints,
        currentSeasonPoints: nextSeasonPoints,

        currentStreak: nextCurrentStreak,
        longestStreak: nextLongestStreak,

        lastQualifiedDate,

        badges: [...badges],

        updatedAt:
          admin.firestore.FieldValue.serverTimestamp()
      };

      transaction.set(
        userReference,
        profileUpdate,
        { merge: true }
      );

      transaction.set(
        scoreReference,
        {
          uid: userId,
          username: user.username,
          usernameLower: user.usernameLower,

          seasonId: SEASON.id,

          points: nextSeasonPoints,
          currentStreak: nextCurrentStreak,

          leaderboardOptIn:
            user.leaderboardOptIn !== false,

          updatedAt:
            admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      transaction.set(
        communityReference,
        {
          currentMinutes:
            admin.firestore.FieldValue.increment(1),

          seasonId: SEASON.id
        },
        { merge: true }
      );

      transaction.set(
        db.collection("pointEvents").doc(),
        {
          uid: userId,
          seasonId: SEASON.id,
          date: serverDate,

          readingPoints: 1,
          streakBonus,

          totalAwarded: totalPointsEarned,

          createdAt:
            admin.firestore.FieldValue.serverTimestamp()
        }
      );

      return {
        updatedProfile: {
          ...user,
          ...profileUpdate
        },

        message
      };
    }
  );

  return transactionResult;
});

/* --------------------------------------------------
   FUNCTION: DAILY POLL VOTE
-------------------------------------------------- */

exports.voteDailyPoll = onCall(async (request) => {
  const userId = requireSignedIn(request);

  const pollId = String(request.data?.pollId || "");

  const optionIndex = Number(
    request.data?.optionIndex
  );

  if (
    !pollId.startsWith("daily-") ||
    !Number.isInteger(optionIndex)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid poll choice."
    );
  }

  const pollReference = db
    .collection("polls")
    .doc(pollId);

  const userReference = db
    .collection("users")
    .doc(userId);

  return db.runTransaction(async (transaction) => {
    const pollDocument = await transaction.get(
      pollReference
    );

    const userDocument = await transaction.get(
      userReference
    );

    if (!pollDocument.exists) {
      throw new HttpsError(
        "not-found",
        "This poll is not available."
      );
    }

    if (!userDocument.exists) {
      throw new HttpsError(
        "not-found",
        "Your profile was not found."
      );
    }

    const poll = pollDocument.data();
    const user = userDocument.data();

    if (
      optionIndex < 0 ||
      optionIndex >= poll.options.length
    ) {
      throw new HttpsError(
        "invalid-argument",
        "That poll choice does not exist."
      );
    }

    const userPollVotes = user.pollVotes || {};

    if (
      Object.prototype.hasOwnProperty.call(
        userPollVotes,
        pollId
      )
    ) {
      throw new HttpsError(
        "already-exists",
        "You already voted in today’s poll."
      );
    }

    const votes = {
      ...(poll.votes || {})
    };

    votes[optionIndex] =
      Number(votes[optionIndex] || 0) + 1;

    transaction.update(pollReference, {
      votes,
      updatedAt:
        admin.firestore.FieldValue.serverTimestamp()
    });

    transaction.set(
      userReference,
      {
        pollVotes: {
          ...userPollVotes,
          [pollId]: optionIndex
        },

        updatedAt:
          admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return {
      votes
    };
  });
});

/* --------------------------------------------------
   FUNCTION: PRIVATE PRAYER MARKER
-------------------------------------------------- */

exports.markPrayer = onCall(async (request) => {
  const userId = requireSignedIn(request);

  const requestedDate = String(
    request.data?.date || ""
  );

  const today = getChicagoDateKey();

  if (requestedDate !== today) {
    throw new HttpsError(
      "invalid-argument",
      "Prayer moments can only be marked for today."
    );
  }

  const prayerReference = db
    .collection("users")
    .doc(userId)
    .collection("prayers")
    .doc(today);

  await prayerReference.set(
    {
      date: today,
      prayed: true,

      updatedAt:
        admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return {
    message:
      "Your prayer moment was recorded privately. Thank you for praying for peace."
  };
});

/* --------------------------------------------------
   FUNCTION: SAVE ARTICLE TO READ LATER
-------------------------------------------------- */

exports.saveReadLater = onCall(async (request) => {
  const userId = requireSignedIn(request);

  const article = request.data?.article || {};

  const articleId = sanitizeText(article.id || "");
  const title = sanitizeText(article.title || "");
  const url = String(article.url || "");

  if (
    !articleId ||
    !title ||
    !/^https?:\/\//.test(url)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "That story could not be saved."
    );
  }

  const userReference = db
    .collection("users")
    .doc(userId);

  const readLater = await db.runTransaction(
    async (transaction) => {
      const userDocument = await transaction.get(
        userReference
      );

      if (!userDocument.exists) {
        throw new HttpsError(
          "not-found",
          "Your profile was not found."
        );
      }

      const user = userDocument.data();

      const existingArticles = Array.isArray(
        user.readLater
      )
        ? user.readLater
        : [];

      const withoutDuplicate = existingArticles.filter(
        (savedArticle) => {
          return savedArticle.id !== articleId;
        }
      );

      const updatedReadLater = [
        {
          id: articleId,
          title,
          url,
          source: sanitizeText(
            article.source || "Source"
          ),
          savedAt: new Date().toISOString()
        },
        ...withoutDuplicate
      ].slice(0, 30);

      transaction.update(userReference, {
        readLater: updatedReadLater,

        updatedAt:
          admin.firestore.FieldValue.serverTimestamp()
      });

      return updatedReadLater;
    }
  );

  return {
    readLater
  };
});

/* --------------------------------------------------
   FUNCTION: PRIVATE CONTENT REPORT
-------------------------------------------------- */

exports.submitReport = onCall(async (request) => {
  const userId = requireSignedIn(request);

  const reportType = String(
    request.data?.reportType || "other"
  );

  const message = sanitizeText(
    request.data?.message || ""
  );

  const allowedTypes = [
    "story",
    "username",
    "poll",
    "bug",
    "other"
  ];

  if (!allowedTypes.includes(reportType)) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid report type."
    );
  }

  if (message.length < 4 || message.length > 1000) {
    throw new HttpsError(
      "invalid-argument",
      "Please enter a report between 4 and 1,000 characters."
    );
  }

  await db.collection("reports").add({
    uid: userId,
    reportType,
    message,

    status: "new",

    createdAt:
      admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    ok: true
  };
});

/* --------------------------------------------------
   HEALTH CHECK

   Useful later for testing whether Firebase Functions
   has deployed correctly.
-------------------------------------------------- */

exports.healthCheck = onRequest((request, response) => {
  response.status(200).json({
    ok: true,
    website: "HappyHeadlines",
    season: SEASON.name
  });
});
