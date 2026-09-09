/* contact.js — Contact Form Validation */

var contactForm       = document.getElementById('contactForm');
var contactSubmitBtn  = document.getElementById('contactSubmitBtn');
var contactSubmitText = document.getElementById('contactSubmitText');
var contactLoader     = document.getElementById('contactLoader');
var successMessage    = document.getElementById('successMessage');
var sendAnotherBtn    = document.getElementById('sendAnotherBtn');
var messageEl         = document.getElementById('message');
var charCount         = document.getElementById('charCount');

if (messageEl && charCount) {
  messageEl.addEventListener('keypress', function () {
    charCount.innerText = messageEl.value.length + ' / 1000';
  });
  messageEl.addEventListener('focus', function () {
    charCount.innerText = messageEl.value.length + ' / 1000';
  });
}

if (sendAnotherBtn) {
  sendAnotherBtn.addEventListener('click', function () {
    successMessage.classList.add('hidden');
    contactForm.classList.remove('hidden');
    contactForm.reset();
    charCount.innerText = '0 / 1000';
    clearContactErrors();
  });
}

if (contactForm) {
  contactForm.addEventListener('submit', function (e) {
    e.preventDefault();
    clearContactErrors();
    if (!validateContactForm()) return;
    contactSubmitBtn.setAttribute('disabled', true);
    contactSubmitText.classList.add('hidden');
    contactLoader.classList.remove('hidden');

    var payload = {
      name: document.getElementById('firstName').value.trim() + ' ' +
        document.getElementById('lastName').value.trim(),
      email: document.getElementById('email').value.trim(),
      message: document.getElementById('message').value.trim()
    };

    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.success) {
            throw new Error(data.error || (data.errors && data.errors.join(' ')) || 'Message could not be saved.');
          }
          return data;
        });
      })
      .then(function () {
        contactSubmitBtn.removeAttribute('disabled');
        contactSubmitText.classList.remove('hidden');
        contactLoader.classList.add('hidden');
        contactForm.classList.add('hidden');
        successMessage.classList.remove('hidden');
      })
      .catch(function (err) {
        contactSubmitBtn.removeAttribute('disabled');
        contactSubmitText.classList.remove('hidden');
        contactLoader.classList.add('hidden');
        showContactError('errMessage', document.getElementById('message'), err.message || 'Message could not be saved.');
      });
  });
}

function validateContactForm() {
  var valid       = true;
  var namePattern = /^[A-Za-z\s]{2,50}$/;
  var mobPattern  = /^[0-9]{9,10}$/;

  var firstName = document.getElementById('firstName');
  if (!firstName.value.trim() || !namePattern.test(firstName.value.trim())) {
    showContactError('errFirstName', firstName, 'Enter a valid name (letters only, 2–50 chars).');
    valid = false;
  }

  var lastName = document.getElementById('lastName');
  if (!lastName.value.trim() || !namePattern.test(lastName.value.trim())) {
    showContactError('errLastName', lastName, 'Enter a valid name (letters only, 2–50 chars).');
    valid = false;
  }

  var genderInputs  = document.querySelectorAll('input[name="gender"]');
  var genderSelected = false;
  for (var i = 0; i < genderInputs.length; i++) {
    if (genderInputs[i].checked) { genderSelected = true; break; }
  }
  if (!genderSelected) {
    var errGender = document.getElementById('errGender');
    if (errGender) errGender.innerText = 'Please select a gender.';
    valid = false;
  }

  var mobile = document.getElementById('mobile');
  if (!mobile.value.trim() || !mobPattern.test(mobile.value.trim())) {
    showContactError('errMobile', mobile, 'Enter a valid mobile number (9–10 digits).');
    valid = false;
  }

  var dob = document.getElementById('dob');
  if (!dob.value) {
    showContactError('errDob', dob, 'Please enter your date of birth.');
    valid = false;
  } else {
    var age = new Date().getFullYear() - new Date(dob.value).getFullYear();
    if (age < 16 || age > 100) {
      showContactError('errDob', dob, 'Age must be between 16 and 100 years.');
      valid = false;
    }
  }

  var email        = document.getElementById('email');
  var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email.value.trim() || !emailPattern.test(email.value.trim())) {
    showContactError('errEmail', email, 'Enter a valid email address.');
    valid = false;
  }

  var language = document.getElementById('language');
  if (!language.value) {
    showContactError('errLanguage', language, 'Please select a preferred language.');
    valid = false;
  }

  var reasonForContact = document.getElementById('reasonForContact');
  if (!reasonForContact.value) {
    showContactError('errReasonForContact', reasonForContact, 'Please select a reason for contact.');
    valid = false;
  }

  var message = document.getElementById('message');
  if (!message.value.trim() || message.value.trim().length < 10) {
    showContactError('errMessage', message, 'Message must be at least 10 characters.');
    valid = false;
  } else if (message.value.trim().length > 1000) {
    showContactError('errMessage', message, 'Message cannot exceed 1000 characters.');
    valid = false;
  }

  return valid;
}

function showContactError(errorId, inputEl, msg) {
  var errSpan = document.getElementById(errorId);
  if (errSpan) errSpan.innerText = msg;
  if (inputEl) inputEl.classList.add('error');
}

function clearContactErrors() {
  var spans = document.querySelectorAll('.field-error');
  for (var i = 0; i < spans.length; i++) spans[i].innerText = '';
  var errInputs = document.querySelectorAll('.error');
  for (var j = 0; j < errInputs.length; j++) errInputs[j].classList.remove('error');
}

var fields = ['firstName', 'lastName', 'mobile', 'dob', 'email', 'language', 'reasonForContact', 'message'];
for (var k = 0; k < fields.length; k++) {
  (function (fieldId) {
    var el = document.getElementById(fieldId);
    if (el) {
      el.addEventListener('focus', function () {
        el.classList.remove('error');
        var errEl = document.getElementById('err' + fieldId.charAt(0).toUpperCase() + fieldId.slice(1));
        if (errEl) errEl.innerText = '';
      });
    }
  })(fields[k]);
}
