import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

import {
  firebaseConfig,
  FUNCTIONS_REGION
} from "./firebase-config.js";

/* ------------------------------
   FIREBASE STARTUP
-------------------------------- */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, FUNCTIONS_REGION);

/* ------------------------------
   SEASON 1 SETTINGS
-------------------------------- */

const SEASON = {
  id: "season-of-light-2026-09",
  name: "Season of Light",
  start: new Date("2026-09-01T00:00:00"),
  end: new Date("2026-10-01T00:00:00"),
  dailyReadingCap: 30,
  streakQualifyingMinutes: 5
};

/* ------------------------------
   CLOUD FUNCTIONS
-------------------------------- */

const getHappyFeed = httpsCallable(functions, "getHappyFeed");
const awardReadingMinute = httpsCallable(functions, "awardReadingMinute");
const voteDailyPoll = httpsCallable(functions, "voteDailyPoll");
const markPrayer = httpsCallable(functions, "markPrayer");
const submitReport = httpsCallable(functions, "submitReport");
const saveReadLater = httpsCallable(functions, "saveReadLater");

/* ------------------------------
   APP STATE
-------------------------------- */

let currentUser = null;
let currentProfile = null;

let activeArticles = [];
let allLoadedArticles = [];

let activeCategory = "all";
let currentPoll = null;

let readingInterval = null;
let lastActivityAt = Date.now();

let leaderboardUnsubscribe = null;

/* ------------------------------
   PAGE ELEMENTS
-------------------------------- */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const ui = {
  authDialog: $("#authDialog"),
  settingsDialog: $("#settingsDialog"),
  breathDialog: $("#breathDialog"),
  reportDialog: $("#reportDialog"),
  toast: $("#toast"),

  authButton: $("#authButton"),
  signOutButton: $("#signOutButton"),

  signedOutProfile: $("#signedOutProfile"),
  signedInProfile: $("#signedInProfile"),

  homeArticles: $("#homeArticles"),
  faithArticles: $("#faithArticles"),
  breakingArticles: $("#breakingArticles"),

  leaderboardList: $("#leaderboardList"),

  profileUsername: $("#profileUsername"),
  profileAvatar: $("#profileAvatar"),
  profileJoinDate: $("#profileJoinDate"),

  careerPointsValue: $("#careerPointsValue"),
  seasonPointsValue: $("#seasonPointsValue"),
  currentStreakValue: $("#currentStreakValue"),
  longestStreakValue: $("#longestStreakValue"),

  profileRankName: $("#profileRankName"),
  profileRankDescription: $("#profileRankDescription"),

  todayPoints: $("#todayPoints"),
  readingProgressBar: $("#readingProgressBar"),
  readingProgressText: $("#readingProgressText"),

  myRankCard: $("#myRankCard"),
  myRankHeading: $("#myRankHeading"),
  myRankText: $("#myRankText"),
  rankProgressBar: $("#rankProgressBar"),
  rankProgressText: $("#rankProgressText"),

  readLaterList: $("#readLaterList"),
  badgeList: $("#badgeList"),
  seasonPassport: $("#seasonPassport"),

  leaderboardOptIn: $("#leaderboardOptIn"),
  digestOptIn: $("#digestOptIn"),

  pollQuestion: $("#pollQuestion"),
  pollOptions: $("#pollOptions"),
  pollResults: $("#pollResults"),
  pollMoodTag: $("#pollMoodTag"),

  prayerCountText: $("#prayerCountText"),

  communityChallengeText: $("#communityChallengeText"),
  communityProgressLabel: $("#communityProgressLabel"),
  communityProgressBar: $("#communityProgressBar"),

  courageTitle: $("#courageTitle"),
  courageText: $("#courageText")
};

/* ------------------------------
   HELPER FUNCTIONS
-------------------------------- */

function todayKey(date = new Date()) {
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );

  return localDate.toISOString().slice(0, 10);
}

function escapeHtml(value = "") {
  const safeDiv = document.createElement("div");
  safeDiv.textContent = String(value);

  return safeDiv.innerHTML;
}

function formatPoints(points = 0) {
  return Number(points || 0).toLocaleString();
}

function formatJoinDate(timestamp) {
  if (!timestamp) {
    return "September 2026";
  }

  const date = timestamp.toDate
    ? timestamp.toDate()
    : new Date(timestamp);

  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add("show");

  window.clearTimeout(showToast.timer);

  showToast.timer = window.setTimeout(() => {
    ui.toast.classList.remove("show");
  }, 4000);
}

function getRankTier(rank) {
  if (!rank || rank < 1) {
    return "Wood";
  }

  if (rank === 1) {
    return "King";
  }

  if (rank <= 5) {
    return "Elite";
  }

  if (rank <= 10) {
    return "Diamond";
  }

  if (rank <= 25) {
    return "Ruby";
  }

  if (rank <= 100) {
    return "Emerald";
  }

  if (rank <= 300) {
    return "Topaz";
  }

  if (rank <= 500) {
    return "Gold";
  }

  return "Wood";
}

function getRankRangeText(tier) {
  const ranges = {
    King: "Top 1",
    Elite: "Top 2–5",
    Diamond: "Top 6–10",
    Ruby: "Top 11–25",
    Emerald: "Top 26–100",
    Topaz: "Top 101–300",
    Gold: "Top 301–500",
    Wood: "Top 501+"
  };

  return ranges[tier] || "Keep shining";
}

function seasonCountdown() {
  const now = new Date();

  if (now < SEASON.start) {
    const days = Math.ceil((SEASON.start - now) / 86400000);
    return `Begins in ${days} day${days === 1 ? "" : "s"}`;
  }

  if (now >= SEASON.end) {
    return "Season complete";
  }

  const daysRemaining = Math.ceil((SEASON.end - now) / 86400000);

  return `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`;
}

function updateSeasonCountdowns() {
  const countdownText = seasonCountdown();

  $("#seasonCountdown").textContent = countdownText;
  $("#leaderboardCountdown").textContent = countdownText;
}

function getDailySpark() {
  const sparks = [
    {
      title: "A little light for today",
      text: "Small acts of kindness can change the tone of an entire day."
    },
    {
      title: "Hope grows in ordinary places",
      text: "A helpful word, an honest prayer, and a patient heart can matter more than we realize."
    },
    {
      title: "Goodness is still happening",
      text: "Every day, people feed neighbors, teach children, care for patients, rebuild communities, and choose peace."
    },
    {
      title: "You can be a peaceful presence",
      text: "You do not have to solve everything today. One good choice is enough to begin."
    },
    {
      title: "Mercy is never wasted",
      text: "A person who feels seen, helped, or encouraged may carry that kindness forward."
    }
  ];

  const index = Number(todayKey().replaceAll("-", "")) % sparks.length;

  return sparks[index];
}

function renderDailySpark() {
  const spark = getDailySpark();

  $("#dailySparkTitle").textContent = spark.title;
  $("#dailySparkText").textContent = spark.text;
}

function applySavedSettings() {
  const settings = JSON.parse(
    localStorage.getItem("happyHeadlinesSettings") || "{}"
  );

  document.body.classList.toggle("dark-mode", Boolean(settings.darkMode));
  document.body.classList.toggle(
    "high-contrast",
    Boolean(settings.highContrast)
  );
  document.body.classList.toggle(
    "reduce-motion",
    Boolean(settings.reduceMotion)
  );

  const textSizes = {
    normal: "16px",
    large: "18px",
    xlarge: "20px"
  };

  document.documentElement.style.setProperty(
    "--font-size-base",
    textSizes[settings.textSize || "normal"]
  );

  $("#textSizeSelect").value = settings.textSize || "normal";
  $("#darkModeToggle").checked = Boolean(settings.darkMode);
  $("#contrastToggle").checked = Boolean(settings.highContrast);
  $("#reduceMotionToggle").checked = Boolean(settings.reduceMotion);
}

function saveSettings() {
  const settings = {
    textSize: $("#textSizeSelect").value,
    darkMode: $("#darkModeToggle").checked,
    highContrast: $("#contrastToggle").checked,
    reduceMotion: $("#reduceMotionToggle").checked
  };

  localStorage.setItem(
    "happyHeadlinesSettings",
    JSON.stringify(settings)
  );

  applySavedSettings();

  ui.settingsDialog.close();

  showToast("Your reading settings were saved.");
}

function openTab(tabName) {
  $$(".nav-button").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.tab === tabName
    );
  });

  $$(".tab-panel").forEach((tab) => {
    tab.classList.toggle("active", tab.id === tabName);
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (tabName === "leaderboard") {
    loadLeaderboard();
  }
}

function normalizeUsername(username = "") {
  return username
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

function usernameValidation(username) {
  const cleanUsername = normalizeUsername(username);

  const blockedWords = [
    "admin",
    "moderator",
    "happyheadlines",
    "pope",
    "vatican",
    "support",
    "staff",
    "official",
    "kill",
    "bomb",
    "weapon",
    "hate",
    "sex",
    "nazi",
    "terror",
    "suicide"
  ];

  if (!/^[A-Za-z0-9_]{3,20}$/.test(cleanUsername)) {
    return "Use 3–20 letters, numbers, or underscores only.";
  }

  if (blockedWords.some((word) => cleanUsername.includes(word))) {
    return "Please choose a different respectful username.";
  }

  if (/\d{5,}/.test(cleanUsername)) {
    return "Do not include phone numbers, ZIP codes, or other personal information.";
  }

  return null;
}

function friendlyAuthError(error) {
  const messages = {
    "auth/email-already-in-use":
      "That email already has an account. Try signing in instead.",

    "auth/invalid-email":
      "Please enter a valid email address.",

    "auth/weak-password":
      "Use a password with at least 8 characters.",

    "auth/invalid-credential":
      "That email or password was not recognized.",

    "auth/too-many-requests":
      "Too many attempts. Please wait a moment and try again."
  };

  return messages[error.code] || "Something went wrong. Please try again.";
}

/* ------------------------------
   AUTHENTICATION
-------------------------------- */

function openAuthDialog(view = "choice") {
  $("#authChoiceView").classList.toggle(
    "hidden",
    view !== "choice"
  );

  $("#signInForm").classList.toggle(
    "hidden",
    view !== "signin"
  );

  $("#signUpForm").classList.toggle(
    "hidden",
    view !== "signup"
  );

  if (!ui.authDialog.open) {
    ui.authDialog.showModal();
  }
}

async function isUsernameAvailable(username) {
  const normalizedUsername = normalizeUsername(username);

  const usernameDocument = await getDoc(
    doc(db, "usernames", normalizedUsername)
  );

  return !usernameDocument.exists();
}

async function createAccount(event) {
  event.preventDefault();

  const email = $("#signUpEmail").value.trim();
  const password = $("#signUpPassword").value;
  const username = $("#signUpUsername").value.trim();

  const errorBox = $("#signUpError");

  errorBox.textContent = "";
  errorBox.classList.remove("error");

  const usernameError = usernameValidation(username);

  if (usernameError) {
    errorBox.textContent = usernameError;
    errorBox.classList.add("error");
    return;
  }

  try {
    const available = await isUsernameAvailable(username);

    if (!available) {
      errorBox.textContent =
        "That username is already taken. Please choose another.";
      errorBox.classList.add("error");
      return;
    }

    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    const userId = userCredential.user.uid;

    const publicUsername = username.replace(/^@+/, "").trim();
    const usernameLower = normalizeUsername(publicUsername);

    const profile = {
      username: publicUsername,
      usernameLower,

      careerPoints: 0,
      currentSeasonPoints: 0,
      seasonId: SEASON.id,

      currentStreak: 0,
      longestStreak: 0,

      lastQualifiedDate: null,

      todayDate: todayKey(),
      todayReadingMinutes: 0,
      todayPoints: 0,
      todayStreakBonus: 0,

      leaderboardOptIn: true,
      digestOptIn: false,

      badges: ["first-step"],
      readLater: [],
      pollVotes: {},

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, "users", userId), profile);

    await setDoc(doc(db, "usernames", usernameLower), {
      uid: userId,
      username: publicUsername,
      createdAt: serverTimestamp()
    });

    await setDoc(
      doc(db, "seasonScores", `${SEASON.id}_${userId}`),
      {
        uid: userId,
        username: publicUsername,
        usernameLower,
        seasonId: SEASON.id,

        points: 0,
        currentStreak: 0,

        leaderboardOptIn: true,

        updatedAt: serverTimestamp()
      }
    );

    event.target.reset();

    ui.authDialog.close();

    showToast(
      "Welcome to HappyHeadlines. Your Season of Light begins now."
    );
  } catch (error) {
    console.error(error);

    errorBox.textContent = friendlyAuthError(error);
    errorBox.classList.add("error");
  }
}

async function signInAccount(event) {
  event.preventDefault();

  const email = $("#signInEmail").value.trim();
  const password = $("#signInPassword").value;

  const errorBox = $("#signInError");

  errorBox.textContent = "";
  errorBox.classList.remove("error");

  try {
    await signInWithEmailAndPassword(auth, email, password);

    event.target.reset();

    ui.authDialog.close();

    showToast("Welcome back to HappyHeadlines.");
  } catch (error) {
    console.error(error);

    errorBox.textContent = friendlyAuthError(error);
    errorBox.classList.add("error");
  }
}

/* ------------------------------
   PROFILE DISPLAY
-------------------------------- */

function renderReadLater() {
  const savedArticles = currentProfile?.readLater || [];

  if (!savedArticles.length) {
    ui.readLaterList.innerHTML =
      `<p class="tiny-note">No stories saved yet.</p>`;

    return;
  }

  ui.readLaterList.innerHTML = savedArticles
    .slice(0, 8)
    .map((article) => {
      return `
        <div class="saved-item">
          <a
            href="${escapeHtml(article.url)}"
            target="_blank"
            rel="noopener noreferrer"
          >
            ${escapeHtml(article.title)}
          </a>

          <button
            class="text-button remove-saved"
            data-article-id="${escapeHtml(article.id)}"
            type="button"
          >
            Remove
          </button>
        </div>
      `;
    })
    .join("");
}

function renderBadges() {
  const badgeNames = {
    "first-step": "🌱 First Step",
    "seven-days": "☀ Seven Days of Hope",
    "peace-builder": "🕊 Peace Builder",
    "light-bearer": "🕯 Light Bearer",
    "faithful-friend": "✝ Faithful Friend",
    "history-explorer": "📚 History Explorer"
  };

  const badges = currentProfile?.badges || ["first-step"];

  ui.badgeList.innerHTML = badges
    .map((badge) => {
      return `
        <span class="badge">
          ${badgeNames[badge] || "✨ Bright Heart"}
        </span>
      `;
    })
    .join("");
}

function renderSeasonPassport() {
  const seasonPoints = Number(
    currentProfile?.currentSeasonPoints || 0
  );

  const currentStreak = Number(
    currentProfile?.currentStreak || 0
  );

  const currentRank = currentProfile?.currentRank;

  ui.seasonPassport.innerHTML = `
    <p><strong>${SEASON.name}</strong></p>

    <p>
      ${formatPoints(seasonPoints)} season points ·
      ${currentStreak}-day current streak
    </p>

    <p class="tiny-note">
      ${
        currentRank
          ? `Current placement: #${currentRank} · ${getRankTier(currentRank)}.`
          : "Keep reading to earn your first season placement."
      }
    </p>
  `;
}

function updateProfileUI() {
  if (!currentUser || !currentProfile) {
    ui.signedOutProfile.classList.remove("hidden");
    ui.signedInProfile.classList.add("hidden");

    ui.authButton.textContent = "Sign in";

    ui.todayPoints.textContent = "0";

    ui.readingProgressBar.style.width = "0%";

    ui.readingProgressText.textContent =
      "Sign in to begin your 5-minute daily streak.";

    return;
  }

  ui.signedOutProfile.classList.add("hidden");
  ui.signedInProfile.classList.remove("hidden");

  ui.authButton.textContent = `@${currentProfile.username}`;

  ui.profileUsername.textContent = `@${currentProfile.username}`;

  ui.profileAvatar.textContent =
    currentProfile.username.charAt(0).toUpperCase();

  ui.profileJoinDate.textContent =
    `Member since ${formatJoinDate(currentProfile.createdAt)}`;

  ui.careerPointsValue.textContent =
    formatPoints(currentProfile.careerPoints);

  ui.seasonPointsValue.textContent =
    formatPoints(currentProfile.currentSeasonPoints);

  ui.currentStreakValue.textContent =
    `🔥 ${currentProfile.currentStreak || 0}`;

  ui.longestStreakValue.textContent =
    `☀ ${currentProfile.longestStreak || 0}`;

  const rank = currentProfile.currentRank || null;
  const tier = getRankTier(rank);

  ui.profileRankName.textContent = rank
    ? `${tier} · #${rank}`
    : "Wood";

  ui.profileRankDescription.textContent = rank
    ? `${getRankRangeText(tier)} this Happy Season. Career points always remain yours.`
    : "Start reading to enter the current season ranking.";

  const minutesToday = Number(
    currentProfile.todayReadingMinutes || 0
  );

  const pointsToday = Number(
    currentProfile.todayPoints || 0
  );

  const progressPercent = Math.min(
    (minutesToday / SEASON.dailyReadingCap) * 100,
    100
  );

  ui.todayPoints.textContent = formatPoints(pointsToday);

  ui.readingProgressBar.style.width = `${progressPercent}%`;

  if (minutesToday < SEASON.streakQualifyingMinutes) {
    ui.readingProgressText.textContent =
      `${minutesToday}/5 active minutes today. ` +
      `Reach 5 minutes to extend your streak.`;
  } else {
    ui.readingProgressText.textContent =
      `${minutesToday}/${SEASON.dailyReadingCap} active minutes today. ` +
      `Your ${currentProfile.currentStreak}-day streak bonus is included.`;
  }

  ui.leaderboardOptIn.checked =
    currentProfile.leaderboardOptIn !== false;

  ui.digestOptIn.checked =
    Boolean(currentProfile.digestOptIn);

  renderReadLater();
  renderBadges();
  renderSeasonPassport();
}

async function loadCurrentProfile(userId) {
  const profileDocument = await getDoc(
    doc(db, "users", userId)
  );

  if (!profileDocument.exists()) {
    currentProfile = null;
    updateProfileUI();
    return;
  }

  currentProfile = {
    id: profileDocument.id,
    ...profileDocument.data()
  };

  updateProfileUI();
}

async function updateProfilePreferences() {
  if (!currentUser || !currentProfile) {
    return;
  }

  const leaderboardOptIn = ui.leaderboardOptIn.checked;
  const digestOptIn = ui.digestOptIn.checked;

  await updateDoc(doc(db, "users", currentUser.uid), {
    leaderboardOptIn,
    digestOptIn,
    updatedAt: serverTimestamp()
  });

  await updateDoc(
    doc(db, "seasonScores", `${SEASON.id}_${currentUser.uid}`),
    {
      leaderboardOptIn,
      updatedAt: serverTimestamp()
    }
  );

  currentProfile.leaderboardOptIn = leaderboardOptIn;
  currentProfile.digestOptIn = digestOptIn;

  showToast("Your profile preferences were updated.");
}

/* ------------------------------
   REAL NEWS FEEDS
-------------------------------- */

async function loadFeeds() {
  try {
    const result = await getHappyFeed({
      seasonId: SEASON.id
    });

    const feedData = result.data || {};

    activeArticles = Array.isArray(feedData.home)
      ? feedData.home
      : [];

    allLoadedArticles = [
      ...(feedData.home || []),
      ...(feedData.faith || []),
      ...(feedData.breaking || [])
    ];

    renderArticles(
      ui.homeArticles,
      filterArticles(activeArticles, activeCategory)
    );

    renderArticles(
      ui.faithArticles,
      feedData.faith || []
    );

    renderArticles(
      ui.breakingArticles,
      feedData.breaking || []
    );

    renderPoll(feedData.poll || null);

    renderCommunityChallenge(
      feedData.communityChallenge || null
    );

    renderSaintOfDay(feedData.saintOfDay || null);
  } catch (error) {
    console.error(error);

    const fallbackArticles = [
      {
        id: "official-vatican-news",
        title: "Visit Vatican News for official Catholic news",
        source: "Vatican News",
        url: "https://www.vaticannews.va/en.html",
        category: "Faith",
        excerpt:
          "Open Vatican News to read current original reporting about the Pope, the Holy See, and the Church around the world.",
        whyHopeful:
          "It connects readers with official Catholic reporting and the Church’s worldwide work."
      }
    ];

    allLoadedArticles = fallbackArticles;

    renderArticles(ui.homeArticles, fallbackArticles);
    renderArticles(ui.faithArticles, fallbackArticles);
    renderArticles(ui.breakingArticles, fallbackArticles);
  }
}

function filterArticles(articles, category) {
  if (category === "all") {
    return articles;
  }

  const categoryMap = {
    good: "Good News",
    peace: "Peace",
    science: "Science",
    creation: "Creation"
  };

  return articles.filter((article) => {
    return article.category === categoryMap[category];
  });
}

function renderArticles(container, articles) {
  if (!articles || articles.length === 0) {
    container.innerHTML = `
      <p class="loading-text">
        No verified stories are available in this category right now.
        Please check again later.
      </p>
    `;

    return;
  }

  container.innerHTML = articles
    .map((article) => {
      return `
        <article class="article-card card">
          <div class="article-topline">
            <span class="article-category">
              ${escapeHtml(article.category || "Good News")}
            </span>

            <span class="article-source">
              ${escapeHtml(article.source || "Source")}
            </span>
          </div>

          <div class="article-body">
            <h3>${escapeHtml(article.title)}</h3>

            <p>
              ${escapeHtml(
                article.excerpt ||
                  "Open the original source to read the publisher’s report."
              )}
            </p>

            <p class="why-hopeful">
              <strong>Why this is hopeful:</strong>
              ${escapeHtml(
                article.whyHopeful ||
                  "It highlights a constructive or compassionate development."
              )}
            </p>

            <div class="article-actions">
              <a
                class="article-link"
                href="${escapeHtml(article.url)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                Read original story ↗
              </a>

              <button
                class="article-save"
                data-save-article="${escapeHtml(article.id)}"
                type="button"
              >
                ☆ Read later
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

/* ------------------------------
   DAILY POLL
-------------------------------- */

function renderPoll(poll) {
  currentPoll = poll;

  if (!poll) {
    ui.pollQuestion.textContent =
      "No daily poll is available yet.";

    ui.pollOptions.innerHTML = "";
    ui.pollResults.innerHTML = "";

    return;
  }

  ui.pollQuestion.textContent = poll.question;

  ui.pollMoodTag.textContent =
    poll.style === "fun"
      ? "🍿 JUST FOR FUN"
      : "DAILY REFLECTION";

  const userAlreadyVoted = Boolean(
    currentProfile?.pollVotes?.[poll.id]
  );

  ui.pollOptions.innerHTML = poll.options
    .map((option, index) => {
      return `
        <button
          class="poll-option"
          data-poll-option="${index}"
          type="button"
          ${userAlreadyVoted ? "disabled" : ""}
        >
          <span>○</span>
          ${escapeHtml(option)}
        </button>
      `;
    })
    .join("");

  if (userAlreadyVoted) {
    renderPollResults(poll);
  } else {
    ui.pollResults.classList.add("hidden");
    ui.pollResults.innerHTML = "";
  }
}

function renderPollResults(poll) {
  const totalVotes =
    Object.values(poll.votes || {}).reduce((sum, votes) => {
      return sum + Number(votes || 0);
    }, 0) || 1;

  ui.pollResults.classList.remove("hidden");

  ui.pollResults.innerHTML = `
    <p class="tiny-note">
      Thanks for voting. Results are anonymous.
    </p>

    ${poll.options
      .map((option, index) => {
        const voteCount = Number(poll.votes?.[index] || 0);

        const percentage = Math.round(
          (voteCount / totalVotes) * 100
        );

        return `
          <div class="poll-result-row">
            <div class="poll-result-label">
              <span>${escapeHtml(option)}</span>
              <span>${percentage}%</span>
            </div>

            <div class="progress-track">
              <div
                class="progress-fill"
                style="width: ${percentage}%"
              ></div>
            </div>
          </div>
        `;
      })
      .join("")}
  `;
}

async function submitPollVote(optionIndex) {
  if (!currentUser) {
    openAuthDialog("signup");

    showToast("Create an account to vote in the daily poll.");

    return;
  }

  if (!currentPoll) {
    return;
  }

  try {
    const result = await voteDailyPoll({
      pollId: currentPoll.id,
      optionIndex
    });

    currentPoll.votes =
      result.data.votes || currentPoll.votes;

    currentProfile.pollVotes = {
      ...(currentProfile.pollVotes || {}),
      [currentPoll.id]: optionIndex
    };

    renderPoll(currentPoll);

    showToast("Your vote was counted.");
  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
        "Your vote could not be recorded."
    );
  }
}

/* ------------------------------
   SAINT OF THE DAY
-------------------------------- */

function renderSaintOfDay(saint) {
  if (!saint) {
    $("#saintName").textContent = "Saint of the Day";

    $("#saintDescription").textContent =
      "The daily Catholic observance will appear here when the calendar source is available.";

    $("#saintLesson").textContent = "";

    return;
  }

  $("#liturgicalSeasonText").textContent =
    saint.liturgicalSeason ||
    "CATHOLIC CALENDAR";

  $("#saintName").textContent = saint.name;

  $("#saintDescription").textContent =
    saint.description;

  $("#saintLesson").textContent = saint.lesson
    ? `A light to carry today: ${saint.lesson}`
    : "";
}

/* ------------------------------
   COMMUNITY READING GOAL
-------------------------------- */

function renderCommunityChallenge(challenge) {
  const currentMinutes = Number(
    challenge?.currentMinutes || 0
  );

  const goalMinutes = Number(
    challenge?.goalMinutes || 5000
  );

  const percentComplete = Math.min(
    (currentMinutes / goalMinutes) * 100,
    100
  );

  ui.communityChallengeText.textContent =
    challenge?.description ||
    "Together, we are building a calmer, more hopeful reading habit.";

  ui.communityProgressLabel.textContent =
    `${formatPoints(currentMinutes)} / ` +
    `${formatPoints(goalMinutes)} minutes`;

  ui.communityProgressBar.style.width =
    `${percentComplete}%`;
}

/* ------------------------------
   TODAY IN HISTORY
-------------------------------- */

async function loadHistory() {
  const now = new Date();

  const month = now.getMonth() + 1;
  const day = now.getDate();

  try {
    const url =
      `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`;

    const response = await fetch(url);

    const data = await response.json();

    const calmEvents = (data.events || [])
      .filter((event) => {
        const eventText = event.text || "";

        return !/war|battle|killed|assassinated|massacre/i.test(
          eventText
        );
      })
      .slice(0, 7);

    renderHistory(calmEvents);

    if (calmEvents[0]) {
      ui.courageTitle.textContent =
        `${calmEvents[0].year}: a moment to remember`;

      ui.courageText.textContent =
        calmEvents[0].text;
    }
  } catch (error) {
    console.error(error);

    $("#historyTimeline").innerHTML = `
      <p class="loading-text">
        Today in History could not load right now.
        Please try again later.
      </p>
    `;
  }
}

function renderHistory(events) {
  const historyContainer = $("#historyTimeline");

  if (!events || events.length === 0) {
    historyContainer.innerHTML = `
      <p class="loading-text">
        We could not find a suitable calm historical item for today.
      </p>
    `;

    return;
  }

  historyContainer.innerHTML = events
    .map((event) => {
      return `
        <article class="history-event">
          <span class="history-year">
            ${escapeHtml(event.year)}
          </span>

          <p>${escapeHtml(event.text)}</p>
        </article>
      `;
    })
    .join("");
}

/* ------------------------------
   READING POINTS AND STREAKS
-------------------------------- */

function updateActivityTime() {
  lastActivityAt = Date.now();
}

function startReadingTracker() {
  window.clearInterval(readingInterval);

  if (!currentUser) {
    return;
  }

  readingInterval = window.setInterval(async () => {
    const pageVisible =
      document.visibilityState === "visible";

    const activeRecently =
      Date.now() - lastActivityAt < 90000;

    const openTabExists =
      $(".tab-panel.active") !== null;

    if (!pageVisible || !activeRecently || !openTabExists) {
      return;
    }

    try {
      const result = await awardReadingMinute({
        seasonId: SEASON.id,
        clientDate: todayKey()
      });

      if (result.data?.updatedProfile) {
        currentProfile = {
          ...currentProfile,
          ...result.data.updatedProfile
        };

        updateProfileUI();

        if (result.data.message) {
          showToast(result.data.message);
        }
      }
    } catch (error) {
      console.warn(
        "Reading minute was not awarded:",
        error.message
      );
    }
  }, 60000);
}

/* ------------------------------
   PRAYER
-------------------------------- */

async function savePrayerMoment() {
  if (!currentUser) {
    openAuthDialog("signup");

    showToast(
      "Create an account to mark your private prayer moment."
    );

    return;
  }

  try {
    const result = await markPrayer({
      date: todayKey()
    });

    ui.prayerCountText.textContent =
      result.data?.message ||
      "Your prayer was marked privately.";

    showToast("Thank you for praying for peace.");
  } catch (error) {
    console.error(error);

    showToast(
      "Your prayer moment could not be saved."
    );
  }
}

/* ------------------------------
   READ LATER
-------------------------------- */

function findArticle(articleId) {
  return allLoadedArticles.find((article) => {
    return article.id === articleId;
  });
}

async function saveArticle(articleId) {
  if (!currentUser) {
    openAuthDialog("signup");

    showToast(
      "Create an account to save stories for later."
    );

    return;
  }

  const article = findArticle(articleId);

  if (!article) {
    showToast(
      "That story is no longer available. Please refresh and try again."
    );

    return;
  }

  try {
    const result = await saveReadLater({
      article
    });

    currentProfile.readLater =
      result.data.readLater ||
      currentProfile.readLater ||
      [];

    renderReadLater();

    showToast("Saved to your Read Later shelf.");
  } catch (error) {
    console.error(error);

    showToast("That story could not be saved.");
  }
}

async function removeSavedArticle(articleId) {
  if (!currentUser || !currentProfile) {
    return;
  }

  const updatedReadLater = (
    currentProfile.readLater || []
  ).filter((article) => {
    return article.id !== articleId;
  });

  try {
    await updateDoc(
      doc(db, "users", currentUser.uid),
      {
        readLater: updatedReadLater,
        updatedAt: serverTimestamp()
      }
    );

    currentProfile.readLater = updatedReadLater;

    renderReadLater();

    showToast("Removed from Read Later.");
  } catch (error) {
    console.error(error);

    showToast(
      "That story could not be removed."
    );
  }
}

/* ------------------------------
   LEADERBOARD
-------------------------------- */

function rankHeader(rank) {
  if (rank === 1) {
    return {
      title: "👑 KING",
      subtitle: "Top 1"
    };
  }

  if (rank === 2) {
    return {
      title: "✦ ELITE",
      subtitle: "Top 2–5"
    };
  }

  if (rank === 6) {
    return {
      title: "💎 DIAMOND",
      subtitle: "Top 6–10"
    };
  }

  if (rank === 11) {
    return {
      title: "♦ RUBY",
      subtitle: "Top 11–25"
    };
  }

  return null;
}

function renderLeaderboard(rows) {
  if (!rows || rows.length === 0) {
    ui.leaderboardList.innerHTML = `
      <p class="loading-text">
        No season scores yet. Be one of the first lights this season.
      </p>
    `;

    return;
  }

  let leaderboardHtml = "";

  rows.forEach((row) => {
    const header = rankHeader(row.rank);

    if (header) {
      leaderboardHtml += `
        <div class="rank-section-heading">
          <span>${header.title}</span>
          <small>${header.subtitle}</small>
        </div>
      `;
    }

    const displayUsername =
      row.leaderboardOptIn === false
        ? "Private reader"
        : `@${row.username}`;

    leaderboardHtml += `
      <div class="leaderboard-row">
        <span class="leaderboard-position">
          #${row.rank}
        </span>

        <span class="leaderboard-name">
          ${escapeHtml(displayUsername)}
        </span>

        <span class="leaderboard-points">
          ${formatPoints(row.points)} pts
        </span>
      </div>
    `;
  });

  ui.leaderboardList.innerHTML = leaderboardHtml;
}

async function findMyRank(topRows) {
  if (!currentUser || !currentProfile) {
    ui.myRankCard.classList.add("hidden");
    return;
  }

  ui.myRankCard.classList.remove("hidden");

  const visibleTopRow = topRows.find((row) => {
    return row.uid === currentUser.uid;
  });

  if (visibleTopRow) {
    currentProfile.currentRank = visibleTopRow.rank;

    const tier = getRankTier(visibleTopRow.rank);

    ui.myRankHeading.textContent =
      `#${visibleTopRow.rank} · ${tier}`;

    ui.myRankText.textContent =
      `${formatPoints(visibleTopRow.points)} season points. ` +
      `You are in the ${getRankRangeText(tier)} range.`;

    ui.rankProgressBar.style.width = "100%";

    ui.rankProgressText.textContent =
      "You are visible in the public Top 25.";

    updateProfileUI();

    return;
  }

  const userScore = Number(
    currentProfile.currentSeasonPoints || 0
  );

  const higherScoreQuery = query(
    collection(db, "seasonScores"),
    where("seasonId", "==", SEASON.id),
    where("points", ">", userScore)
  );

  const higherScoreResults = await getDocs(
    higherScoreQuery
  );

  const estimatedRank = higherScoreResults.size + 1;

  currentProfile.currentRank = estimatedRank;

  const tier = getRankTier(estimatedRank);

  ui.myRankHeading.textContent =
    `#${estimatedRank} · ${tier}`;

  ui.myRankText.textContent =
    `${formatPoints(userScore)} season points. ` +
    `Your exact position is private.`;

  const tierMaximum =
    estimatedRank <= 25
      ? 25
      : estimatedRank <= 100
        ? 100
        : estimatedRank <= 300
          ? 300
          : estimatedRank <= 500
            ? 500
            : estimatedRank + 50;

  const progressPercent = Math.max(
    12,
    Math.min(
      95,
      (1 - (estimatedRank - 1) / tierMaximum) * 100
    )
  );

  ui.rankProgressBar.style.width =
    `${progressPercent}%`;

  ui.rankProgressText.textContent =
    `${tier} rank · ${getRankRangeText(tier)}. ` +
    `Keep building your peaceful reading habit.`;

  updateProfileUI();
}

function loadLeaderboard() {
  if (leaderboardUnsubscribe) {
    leaderboardUnsubscribe();
  }

  const leaderboardQuery = query(
    collection(db, "seasonScores"),
    where("seasonId", "==", SEASON.id),
    orderBy("points", "desc"),
    orderBy("currentStreak", "desc"),
    limit(25)
  );

  leaderboardUnsubscribe = onSnapshot(
    leaderboardQuery,
    async (snapshot) => {
      const rows = snapshot.docs.map(
        (scoreDocument, index) => {
          return {
            id: scoreDocument.id,
            rank: index + 1,
            ...scoreDocument.data()
          };
        }
      );

      renderLeaderboard(rows);

      await findMyRank(rows);
    },
    (error) => {
      console.error(error);

      ui.leaderboardList.innerHTML = `
        <p class="loading-text">
          The leaderboard needs a Firestore index.
          Firebase will provide a link in your browser console to create it.
        </p>
      `;
    }
  );
}

/* ------------------------------
   REPORT FORM
-------------------------------- */

async function sendReport(event) {
  event.preventDefault();

  const reportType = $("#reportType").value;
  const reportMessage = $("#reportMessage").value.trim();

  const statusMessage = $("#reportStatus");

  statusMessage.textContent = "";
  statusMessage.classList.remove("error");

  if (!currentUser) {
    statusMessage.textContent =
      "Please sign in before sending a report.";

    statusMessage.classList.add("error");

    return;
  }

  try {
    await submitReport({
      reportType,
      message: reportMessage
    });

    statusMessage.textContent =
      "Thank you. Your report was sent privately to the moderation queue.";

    event.target.reset();

    window.setTimeout(() => {
      ui.reportDialog.close();
    }, 1600);
  } catch (error) {
    console.error(error);

    statusMessage.textContent =
      "Your report could not be sent. Please try again.";

    statusMessage.classList.add("error");
  }
}

/* ------------------------------
   BREATHING TOOL
-------------------------------- */

function startBreathingExercise() {
  const circle = $("#breathCircle");
  const instruction = $("#breathInstruction");

  circle.classList.add("breathing");

  instruction.textContent =
    "Breathe in… hold gently… and breathe out slowly.";

  window.setTimeout(() => {
    circle.classList.remove("breathing");

    instruction.textContent =
      "You can return to your day one calm breath at a time.";
  }, 24000);
}

/* ------------------------------
   EVENT LISTENERS
-------------------------------- */

function setupEventListeners() {
  $$(".nav-button").forEach((button) => {
    button.addEventListener("click", () => {
      openTab(button.dataset.tab);
    });
  });

  $$("[data-open-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      openTab(button.dataset.openTab);
    });
  });

  ui.authButton.addEventListener("click", () => {
    if (currentUser) {
      openTab("profile");
    } else {
      openAuthDialog("choice");
    }
  });

  $("#profileSignInButton").addEventListener(
    "click",
    () => openAuthDialog("signup")
  );

  $("#showSignInButton").addEventListener(
    "click",
    () => openAuthDialog("signin")
  );

  $("#showSignUpButton").addEventListener(
    "click",
    () => openAuthDialog("signup")
  );

  $$(".switch-auth-view").forEach((button) => {
    button.addEventListener("click", () => {
      openAuthDialog(button.dataset.view);
    });
  });

  $("#signInForm").addEventListener(
    "submit",
    signInAccount
  );

  $("#signUpForm").addEventListener(
    "submit",
    createAccount
  );

  ui.signOutButton.addEventListener("click", async () => {
    await signOut(auth);

    showToast(
      "You signed out. Your progress is safely stored in your account."
    );

    openTab("home");
  });

  $("#calmModeButton").addEventListener("click", () => {
    document.body.classList.toggle("calm-mode");

    const enabled = document.body.classList.contains(
      "calm-mode"
    );

    $("#calmModeButton").textContent = enabled
      ? "☁ Calm Mode: On"
      : "☁ Calm Mode";

    showToast(
      enabled
        ? "Calm Mode is on. Stay with gentle, hopeful reading."
        : "Calm Mode is off."
    );
  });

  $("#settingsButton").addEventListener("click", () => {
    ui.settingsDialog.showModal();
  });

  $("#saveSettingsButton").addEventListener(
    "click",
    saveSettings
  );

  $("#takeBreathButton").addEventListener("click", () => {
    ui.breathDialog.showModal();
  });

  $("#footerBreathButton").addEventListener("click", () => {
    ui.breathDialog.showModal();
  });

  $("#startBreathingButton").addEventListener(
    "click",
    startBreathingExercise
  );

  $("#prayedButton").addEventListener(
    "click",
    savePrayerMoment
  );

  $("#saintPrayerButton").addEventListener(
    "click",
    savePrayerMoment
  );

  $("#reportProblemButton").addEventListener(
    "click",
    () => ui.reportDialog.showModal()
  );

  $("#reportForm").addEventListener(
    "submit",
    sendReport
  );

  $$("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = document.getElementById(
        button.dataset.closeDialog
      );

      dialog.close();
    });
  });

  $$(".filter-button").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category;

      $$(".filter-button").forEach((filterButton) => {
        filterButton.classList.remove("active");
      });

      button.classList.add("active");

      renderArticles(
        ui.homeArticles,
        filterArticles(activeArticles, activeCategory)
      );
    });
  });

  document.addEventListener("click", (event) => {
    const pollOption = event.target.closest(
      "[data-poll-option]"
    );

    const saveButton = event.target.closest(
      "[data-save-article]"
    );

    const removeButton = event.target.closest(
      ".remove-saved"
    );

    const mapPin = event.target.closest(
      ".map-pin"
    );

    if (pollOption) {
      submitPollVote(
        Number(pollOption.dataset.pollOption)
      );
    }

    if (saveButton) {
      saveArticle(saveButton.dataset.saveArticle);
    }

    if (removeButton) {
      removeSavedArticle(removeButton.dataset.articleId);
    }

    if (mapPin) {
      $("#mapRegionText").textContent =
        `${mapPin.dataset.region}: explore Good News and Peace stories for hopeful updates from this broad region.`;
    }
  });

  ui.leaderboardOptIn.addEventListener(
    "change",
    updateProfilePreferences
  );

  ui.digestOptIn.addEventListener(
    "change",
    updateProfilePreferences
  );

  const activityEvents = [
    "mousemove",
    "mousedown",
    "keydown",
    "scroll",
    "touchstart"
  ];

  activityEvents.forEach((eventName) => {
    document.addEventListener(
      eventName,
      updateActivityTime,
      { passive: true }
    );
  });

  document.addEventListener(
    "visibilitychange",
    updateActivityTime
  );
}

/* ------------------------------
   APP STARTUP
-------------------------------- */

async function initializeHappyHeadlines() {
  applySavedSettings();

  updateSeasonCountdowns();

  renderDailySpark();

  setupEventListeners();

  window.setInterval(updateSeasonCountdowns, 60000);

  await Promise.all([
    loadFeeds(),
    loadHistory()
  ]);

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;

    if (user) {
      await loadCurrentProfile(user.uid);

      startReadingTracker();

      loadLeaderboard();
    } else {
      currentProfile = null;

      window.clearInterval(readingInterval);

      updateProfileUI();

      if (leaderboardUnsubscribe) {
        leaderboardUnsubscribe();

        leaderboardUnsubscribe = null;
      }
    }
  });
}

initializeHappyHeadlines();
