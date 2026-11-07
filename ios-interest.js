/**
 * "I want it on iPhone" — demand counter for the landing hero.
 *
 * The number comes from /api/ios-interest (Workers KV, see worker/index.js).
 * A local flag keeps the button in its "voted" state across reloads; the
 * server does its own per-visitor dedupe, so a cleared browser can't inflate
 * the count by much.
 */
(function () {
  "use strict";

  var ENDPOINT = "/api/ios-interest";
  var VOTED_KEY = "buildeye.iosInterest.voted";

  var button = document.getElementById("ios-interest-btn");
  var output = document.getElementById("ios-interest-count");
  if (!button || !output) return;

  var voted = false;
  try {
    voted = localStorage.getItem(VOTED_KEY) === "1";
  } catch (e) {
    /* private mode — just treat the visitor as not having voted */
  }

  function rememberVote() {
    try {
      localStorage.setItem(VOTED_KEY, "1");
    } catch (e) {
      /* nothing to do, the server-side dedupe still holds */
    }
  }

  function showCount(count) {
    if (typeof count !== "number" || count < 1) {
      output.hidden = true;
      return;
    }
    output.textContent =
      count === 1
        ? "1 person asked for the iPhone app"
        : count.toLocaleString() + " people asked for the iPhone app";
    output.hidden = false;
  }

  function markVoted() {
    button.disabled = true;
    button.classList.add("is-voted");
    button.querySelector(".ios-interest-label").textContent = "Counted — thanks!";
  }

  if (voted) markVoted();

  fetch(ENDPOINT, { headers: { accept: "application/json" } })
    .then(function (res) {
      return res.ok ? res.json() : null;
    })
    .then(function (data) {
      if (data) showCount(data.count);
    })
    .catch(function () {
      /* counter offline — the button still works, we just show no number */
    });

  button.addEventListener("click", function () {
    if (button.disabled) return;
    button.disabled = true;

    fetch(ENDPOINT, {
      method: "POST",
      headers: { accept: "application/json" },
    })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (data) {
        if (!data) throw new Error("counter unavailable");
        rememberVote();
        markVoted();
        showCount(data.count);
      })
      .catch(function () {
        button.disabled = false;
        output.textContent = "Couldn’t register that — please try again.";
        output.hidden = false;
      });
  });
})();
