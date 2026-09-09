/* main.js — shared across all pages */

// ----- NAVBAR SCROLL -----
var navbar = document.getElementById('navbar');
if (navbar) {
  window.addEventListener('scroll', function () {
    if (window.scrollY > 40) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });
}

// ----- MOBILE MENU TOGGLE -----
var navToggle = document.getElementById('navToggle');
var navLinks  = document.getElementById('navLinks');
if (navToggle && navLinks) {
  navToggle.addEventListener('click', function () {
    navLinks.classList.toggle('open');
  });
  var links = navLinks.querySelectorAll('.nav-link');
  for (var i = 0; i < links.length; i++) {
    links[i].addEventListener('click', function () {
      navLinks.classList.remove('open');
    });
  }
}

// ----- SCROLL REVEAL -----
var revealEls = document.querySelectorAll('.reveal, .reveal-up');

function checkReveal() {
  for (var i = 0; i < revealEls.length; i++) {
    var el   = revealEls[i];
    var rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight - 80) {
      el.classList.add('in-view');
    }
  }
}

window.addEventListener('scroll', checkReveal);
window.addEventListener('load', checkReveal);
checkReveal();

// ----- COUNTER ANIMATION -----
var counters        = document.querySelectorAll('.stat-num');
var countersStarted = false;
var statsBar        = document.getElementById('statsBar');

if (statsBar) {
  var statsObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting && !countersStarted) {
        countersStarted = true;
        for (var i = 0; i < counters.length; i++) {
          animateCounter(counters[i]);
        }
      }
    });
  }, { threshold: 0.3 });
  statsObserver.observe(statsBar);
}

function animateCounter(el) {
  var target    = parseInt(el.getAttribute('data-count'), 10);
  var current   = 0;
  var increment = Math.ceil(target / 60);
  var timer = setInterval(function () {
    current += increment;
    if (current >= target) {
      current = target;
      clearInterval(timer);
    }
    el.innerText = current;
  }, 20);
}

// ----- HERO VIDEO PARALLAX -----
var heroBg = document.getElementById('heroBg');
if (heroBg) {
  window.addEventListener('scroll', function () {
    var scrollY = window.scrollY;
    heroBg.style.transform = 'translateY(' + (scrollY * 0.35) + 'px)';
  });
}