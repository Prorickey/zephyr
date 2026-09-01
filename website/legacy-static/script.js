// Reveal sections as they scroll into view
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.15 }
);

document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

// Mobile menu
const taskbar = document.getElementById("taskbar");
const nav = document.getElementById("nav");
const menuToggle = document.getElementById("menuToggle");

menuToggle.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  taskbar.classList.toggle("menu-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
});

// Close the mobile menu after choosing a section
nav.querySelectorAll("a").forEach((link) =>
  link.addEventListener("click", () => {
    nav.classList.remove("open");
    taskbar.classList.remove("menu-open");
    menuToggle.setAttribute("aria-expanded", "false");
  })
);
