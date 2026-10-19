// The contact form, the cabin's mailbox. You can't walk while it's open, so
// typing in it doesn't move you.
import { state } from '../state.js';

const contact = document.getElementById('contact');
const contactForm = contact.querySelector('[data-form]');
const contactSent = contact.querySelector('[data-sent]');
const contactStatus = contact.querySelector('[data-status]');
export function openContact() {
  contact.style.display = '';          // not `hidden`: its Tailwind `flex` class would override that
  state.contactOpen = true;
  contactForm.hidden = false;
  contactSent.hidden = true;
  contactStatus.hidden = true;
  contactForm.querySelector('input').focus();
}
function closeContact() {
  contact.style.display = 'none';
  state.contactOpen = false;
  document.activeElement?.blur();      // so the arrow keys go back to walking
}
contact.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeContact));
contact.addEventListener('click', (e) => { if (e.target === contact) closeContact(); });
window.addEventListener('keydown', (e) => { if (state.contactOpen && e.code === 'Escape') closeContact(); });

function contactError(text) {
  contactStatus.textContent = text;
  contactStatus.style.color = '#aa3220';
  contactStatus.hidden = false;
}
contactForm.addEventListener('submit', async (e) => {
  e.preventDefault();                  // send it with fetch instead, so the page stays put
  const send = contactForm.querySelector('[data-send]');
  send.disabled = true;
  send.textContent = 'sending…';
  try {
    const response = await fetch(contactForm.action, { method: 'POST', body: new FormData(contactForm) });
    const reply = await response.json().catch(() => ({}));
    if (!response.ok || !reply.ok) {
      contactError(reply.error || "Couldn't send that. Try again in a bit?");
      return;
    }
    state.mailSent = true;
    contactForm.reset();
    contactForm.hidden = true;
    contactSent.hidden = false;
    contactSent.querySelector('[data-close]').focus();
  } catch (err) {
    contactError("Couldn't reach the mailbox. Check your connection and try again?");
  } finally {
    send.disabled = false;
    send.textContent = 'send';
  }
});
