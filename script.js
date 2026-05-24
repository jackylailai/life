/* life log — minimal vanilla JS.
   keep this file small: just nav-anchor smooth scrolling, year token guard,
   and a soft fade-in observer for blocks. nothing heavy. */

(() => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Soft fade-in for blocks as they enter the viewport.
  if (!prefersReducedMotion && "IntersectionObserver" in window) {
    const blocks = document.querySelectorAll(".block, .hero");
    blocks.forEach((block) => {
      block.style.opacity = "0";
      block.style.transform = "translateY(8px)";
      block.style.transition = "opacity 600ms ease, transform 600ms ease";
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.style.opacity = "1";
          entry.target.style.transform = "translateY(0)";
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    blocks.forEach((block) => observer.observe(block));
  }

  // Anchor link offset for sticky header.
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const id = link.getAttribute("href").slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      const header = document.querySelector(".site-header");
      const offset = header ? header.offsetHeight + 12 : 0;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({
        top,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
      history.replaceState(null, "", `#${id}`);
    });
  });
})();
