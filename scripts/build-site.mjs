import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const pageKeys = ["home", "services", "prices", "about", "contacts"];
const root = process.cwd();
const outDir = path.join(root, "dist");

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const escapeJsonForHtml = (value) => JSON.stringify(value, null, 2).replaceAll("<", "\\u003c");

const isExternalUrl = (url = "") => /^https?:\/\//.test(url);

const pageDepthPrefix = (page) => {
  if (page.file === "404.html") {
    return "/";
  }

  return page.path === "/" ? "" : "../";
};

const isRootLevelPage = (page) => page.path === "/" || page.file === "404.html";

const canonicalUrl = (site, page) => `${site.url}${page.path === "/" ? "/" : page.path}`;

const assetPath = (page, value = "") => {
  if (!value.startsWith("/")) {
    return value;
  }

  return `${pageDepthPrefix(page)}${value.slice(1)}`;
};

const absoluteUrl = (site, value = "") => {
  if (isExternalUrl(value)) {
    return value;
  }

  return `${site.url}${value.startsWith("/") ? value : `/${value}`}`;
};

const linkHref = (page, url = "") => {
  if (isExternalUrl(url) || url.startsWith("#") || url.startsWith("tel:") || url.startsWith("mailto:")) {
    return url;
  }

  if (page.file === "404.html") {
    return url;
  }

  if (isRootLevelPage(page)) {
    return url === "/" ? "/" : url.replace(/^\//, "");
  }

  return url === "/" ? "../" : `../${url.replace(/^\//, "")}`;
};

const externalAttrs = (url = "") => (isExternalUrl(url) ? ' target="_blank" rel="noopener noreferrer"' : "");

const renderTextList = (items = [], className = "check-list") => {
  if (!items.length) {
    return "";
  }

  return `<ul class="${className}">
${items.map((item) => `            <li>${escapeHtml(item)}</li>`).join("\n")}
          </ul>`;
};

const renderImage = (page, image, className = "") => {
  const classAttr = className ? ` class="${className}"` : "";

  return `<img${classAttr} src="${escapeHtml(assetPath(page, image.image))}" width="${escapeHtml(image.width)}" height="${escapeHtml(image.height)}" alt="${escapeHtml(image.alt)}" loading="lazy">`;
};

const renderHead = (site, page) => {
  const cssPath = assetPath(page, "/assets/styles.css");
  const scriptPath = assetPath(page, "/assets/menu.js");
  const iconPath = assetPath(page, site.logo);
  const preload = page.seo.preloadImage
    ? `  <link rel="preload" as="image" href="${escapeHtml(assetPath(page, page.seo.preloadImage))}" fetchpriority="high">\n`
    : "";
  const themeColor = page.path === "/" ? `  <meta name="theme-color" content="${escapeHtml(site.themeColor)}">\n` : "";

  return `<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.seo.title)}</title>
  <meta name="description" content="${escapeHtml(page.seo.description)}">
  <meta name="robots" content="${escapeHtml(page.seo.robots || "index,follow")}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl(site, page))}">
${preload}  <link rel="stylesheet" href="${escapeHtml(cssPath)}">
  <link rel="icon" type="image/webp" href="${escapeHtml(iconPath)}">
  <script src="${escapeHtml(scriptPath)}" defer></script>
  <meta property="og:type" content="website">
  <meta property="og:locale" content="${escapeHtml(site.locale)}">
  <meta property="og:title" content="${escapeHtml(page.seo.ogTitle)}">
  <meta property="og:description" content="${escapeHtml(page.seo.ogDescription)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl(site, page))}">
  <meta property="og:image" content="${escapeHtml(absoluteUrl(site, page.seo.ogImage))}">
${themeColor}  ${renderStructuredData(site, page)}
</head>`;
};

const renderHeader = (site, navigation, pageKey, page) => `<header class="site-header">
    <div class="header-inner">
      <a class="brand" href="${escapeHtml(linkHref(page, "/"))}" aria-label="${escapeHtml(site.name)}">
        <img class="brand-mark" src="${escapeHtml(assetPath(page, site.logo))}" width="44" height="44" alt="">
        <span>
          <span class="brand-name">${escapeHtml(site.name)}</span>
          <span class="brand-note">${escapeHtml(site.brandNote)}</span>
        </span>
      </a>
      <button class="menu-toggle" type="button" hidden aria-label="Відкрити навігацію" aria-expanded="false" aria-controls="primary-navigation">
        <span class="menu-toggle-bars" aria-hidden="true"></span>
      </button>
      <nav class="site-nav" id="primary-navigation" aria-label="Основна навігація">
${navigation
  .map((item) => {
    const className = item.cta ? ' class="nav-cta"' : "";
    const current = item.key === pageKey ? ' aria-current="page"' : "";

    return `        <a${className} href="${escapeHtml(linkHref(page, item.url))}"${current}${externalAttrs(item.url)}>${escapeHtml(item.label)}</a>`;
  })
  .join("\n")}
      </nav>
    </div>
  </header>`;

const renderFooter = (site) => `<footer class="site-footer">
    <div class="footer-inner">
      <div>
        <strong>${escapeHtml(site.name)} by ${escapeHtml(site.alternateName)}</strong><br>
        ${escapeHtml(site.address.display)}
      </div>
      <div class="footer-links" aria-label="Контакти">
        <a href="tel:${escapeHtml(site.phone)}">${escapeHtml(site.phone)}</a>
        <a href="${escapeHtml(site.links.telegram)}" target="_blank" rel="noopener noreferrer">Telegram</a>
        <a href="${escapeHtml(site.links.instagram)}" target="_blank" rel="noopener noreferrer">Instagram</a>
      </div>
    </div>
  </footer>`;

const renderPageHero = (page) => `<section class="page-hero">
      <div class="container">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
          <a href="${escapeHtml(linkHref(page, "/"))}">Головна</a> / ${escapeHtml(page.breadcrumb)}
        </nav>
        <p class="eyebrow">${escapeHtml(page.hero.eyebrow)}</p>
        <h1>${escapeHtml(page.hero.title)}</h1>
        <p>${escapeHtml(page.hero.lead)}</p>
      </div>
    </section>`;

const renderSectionHeader = (section, centered = false) => `<div class="section-header${centered ? " centered" : ""}">
          <p class="section-kicker">${escapeHtml(section.kicker)}</p>
          <h2 class="section-title" id="${escapeHtml(section.id || slugify(section.title))}">${escapeHtml(section.title)}</h2>
${section.lead ? `          <p class="section-lead">${escapeHtml(section.lead)}</p>\n` : ""}        </div>`;

const renderCards = (items = []) => `<div class="grid ${items.length >= 4 ? "four" : items.length === 2 ? "two" : "three"}">
${items
  .map(
    (item) => `          <div class="card">
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.text)}</p>
          </div>`,
  )
  .join("\n")}
        </div>`;

const renderCta = (cta) => `<section class="section compact">
      <div class="container">
        <div class="cta-band">
          <div>
            <h2>${escapeHtml(cta.title)}</h2>
            <p>${escapeHtml(cta.text)}</p>
          </div>
          <a class="button" href="${escapeHtml(cta.buttonUrl)}"${externalAttrs(cta.buttonUrl)}>${escapeHtml(cta.buttonLabel)}</a>
        </div>
      </div>
    </section>`;

const renderHome = (page) => `<section class="hero" aria-labelledby="hero-title">
      <div class="hero-inner">
        <p class="eyebrow">${escapeHtml(page.hero.eyebrow)}</p>
        <h1 id="hero-title">${escapeHtml(page.hero.title)}</h1>
        <p class="hero-lead">${escapeHtml(page.hero.lead)}</p>
        <div class="hero-actions">
${page.hero.actions
  .map((action) => `          <a class="button${action.variant === "secondary" ? " secondary" : ""}" href="${escapeHtml(linkHref(page, action.url))}"${externalAttrs(action.url)}>${escapeHtml(action.label)}</a>`)
  .join("\n")}
        </div>
      </div>
    </section>

    <section class="hero-points" aria-label="Ключові принципи роботи">
${page.points
  .map(
    (point) => `      <div class="hero-point">
        <strong>${escapeHtml(point.title)}</strong>
        <p>${escapeHtml(point.text)}</p>
      </div>`,
  )
  .join("\n")}
    </section>

    <section class="section surface" aria-labelledby="intro-title">
      <div class="container split">
        <div>
          <p class="section-kicker">${escapeHtml(page.intro.kicker)}</p>
          <h2 class="section-title" id="intro-title">${escapeHtml(page.intro.title)}</h2>
        </div>
        <div>
          <p class="section-lead">${escapeHtml(page.intro.lead)}</p>
          ${renderTextList(page.intro.items)}
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="services-title">
      <div class="container">
        ${renderSectionHeader({ ...page.servicesPreview, id: "services-title" })}
        <div class="grid three">
${page.servicesPreview.cards
  .map(
    (card) => `          <article class="card service-card">
            ${renderImage(page, card)}
            <div class="card-body">
              <h3>${escapeHtml(card.title)}</h3>
              <p>${escapeHtml(card.text)}</p>
            </div>
          </article>`,
  )
  .join("\n")}
        </div>
      </div>
    </section>

    <section class="section dark" aria-labelledby="process-title">
      <div class="container">
        ${renderSectionHeader({ ...page.process, id: "process-title" }, true)}
        ${renderCards(page.process.steps)}
      </div>
    </section>

    <section class="section surface" id="reviews" aria-labelledby="reviews-title">
      <div class="container">
        ${renderSectionHeader({ ...page.reviews, id: "reviews-title" })}
        <div class="quote-grid">
${page.reviews.items
  .map(
    (review) => `          <blockquote>
            <p>${escapeHtml(review.text)}</p>
            <footer>${escapeHtml(review.author)}</footer>
          </blockquote>`,
  )
  .join("\n")}
        </div>
      </div>
    </section>

    ${renderCta(page.cta)}`;

const renderServices = (page) => `${renderPageHero(page)}

    <section class="section surface" aria-labelledby="services-overview">
      <div class="container">
        ${renderSectionHeader({ ...page.overview, id: "services-overview" })}
${page.overview.details
  .map(
    (detail) => `
        <article class="service-detail">
          <h2>${escapeHtml(detail.title)}</h2>
          <div>
            <p>${escapeHtml(detail.text)}</p>
            ${renderTextList(detail.items)}
          </div>
        </article>`,
  )
  .join("\n")}
      </div>
    </section>

    <section class="section" aria-labelledby="procedure-title">
      <div class="container split">
        <div class="media-frame">
          ${renderImage(page, page.procedure)}
        </div>
        <div>
          <p class="section-kicker">${escapeHtml(page.procedure.kicker)}</p>
          <h2 class="section-title" id="procedure-title">${escapeHtml(page.procedure.title)}</h2>
          <p class="section-lead">${escapeHtml(page.procedure.lead)}</p>
          ${renderTextList(page.procedure.items, "feature-list")}
        </div>
      </div>
    </section>

    ${renderCta(page.cta)}`;

const renderPrices = (page) => `${renderPageHero(page)}

${page.tables
  .map(
    (table) => `    <section class="${escapeHtml(table.sectionClass)}" aria-labelledby="${escapeHtml(table.id)}">
      <div class="container">
        ${renderSectionHeader({ ...table, id: table.id })}
        <table class="price-table">
          <thead>
            <tr>
${table.columns.map((column) => `              <th scope="col">${escapeHtml(column.label)}</th>`).join("\n")}
            </tr>
          </thead>
          <tbody>
${table.rows
  .map(
    (row) => `            <tr>
${table.columns
  .map((column, index) => {
    const note = row[`${column.key}Note`];
    const className = column.key === "price" ? ' class="price"' : "";

    return `              <td data-label="${escapeHtml(column.label)}"${className}>${escapeHtml(row[column.key])}${note ? ` <span class="note">${escapeHtml(note)}</span>` : ""}</td>`;
  })
  .join("\n")}
            </tr>`,
  )
  .join("\n")}
          </tbody>
        </table>
      </div>
    </section>`,
  )
  .join("\n\n")}

    ${renderCta(page.cta)}`;

const renderAbout = (page) => `${renderPageHero(page)}

    <section class="section surface" aria-labelledby="team-title">
      <div class="container">
        ${renderSectionHeader({ ...page.team, id: "team-title" })}
        <div class="grid three">
${page.team.members
  .map(
    (member) => `          <article class="card team-member">
            <h3>${escapeHtml(member.name)}</h3>
            <p><strong>${escapeHtml(member.role)}</strong></p>
            <p>${escapeHtml(member.bio)}</p>
          </article>`,
  )
  .join("\n")}
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="focus-title">
      <div class="container split">
        <div class="media-frame">
          ${renderImage(page, page.focus)}
        </div>
        <div>
          <p class="section-kicker">${escapeHtml(page.focus.kicker)}</p>
          <h2 class="section-title" id="focus-title">${escapeHtml(page.focus.title)}</h2>
          <p class="section-lead">${escapeHtml(page.focus.lead)}</p>
          ${renderTextList(page.focus.items, "feature-list")}
        </div>
      </div>
    </section>

    <section class="section dark" aria-labelledby="work-title">
      <div class="container">
        ${renderSectionHeader({ ...page.work, id: "work-title" }, true)}
        ${renderCards(page.work.cards)}
      </div>
    </section>

    ${renderCta(page.cta)}`;

const renderContacts = (site, page) => `${renderPageHero(page)}

    <section class="section surface" aria-labelledby="contact-title">
      <div class="container">
        <div class="section-header">
          <p class="section-kicker">${escapeHtml(page.contact.kicker)}</p>
          <h2 class="section-title" id="contact-title">${escapeHtml(page.contact.title)}</h2>
        </div>
        <div class="contact-panel">
          <div>
            <h3>${escapeHtml(page.contact.addressTitle)}</h3>
${page.contact.addressLines.map((line) => `            <p>${escapeHtml(line)}</p>`).join("\n")}
            <p><strong>Графік:</strong> ${escapeHtml(site.scheduleText)}</p>
            <p><a class="button secondary" href="${escapeHtml(site.links.maps)}" target="_blank" rel="noopener noreferrer">${escapeHtml(page.contact.mapsButtonLabel)}</a></p>
          </div>
          <div>
            <h3>${escapeHtml(page.contact.messagesTitle)}</h3>
            <ul class="contact-list">
              <li>Телефон: <a href="tel:${escapeHtml(site.phone)}">${escapeHtml(site.phone)}</a></li>
              <li>Telegram: <a href="${escapeHtml(site.links.telegram)}" target="_blank" rel="noopener noreferrer">${escapeHtml(site.links.telegramLabel)}</a></li>
              <li>Instagram: <a href="${escapeHtml(site.links.instagram)}" target="_blank" rel="noopener noreferrer">${escapeHtml(site.links.instagramLabel)}</a></li>
            </ul>
            <p>${escapeHtml(page.contact.messageText)}</p>
            <p><a class="button" href="${escapeHtml(site.links.booking)}" target="_blank" rel="noopener noreferrer">${escapeHtml(page.contact.bookingButtonLabel)}</a></p>
          </div>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="visit-title">
      <div class="container split">
        <div>
          <p class="section-kicker">${escapeHtml(page.visit.kicker)}</p>
          <h2 class="section-title" id="visit-title">${escapeHtml(page.visit.title)}</h2>
          <p class="section-lead">${escapeHtml(page.visit.lead)}</p>
        </div>
        ${renderCards(page.visit.cards)}
      </div>
    </section>`;

const renderNotFound = (page) => `<section class="page-hero not-found-hero">
      <div class="container">
        <p class="eyebrow">${escapeHtml(page.hero.eyebrow)}</p>
        <h1>${escapeHtml(page.hero.title)}</h1>
        <p>${escapeHtml(page.hero.lead)}</p>
        <a class="button" href="/">${escapeHtml(page.hero.buttonLabel)}</a>
      </div>
    </section>`;

const pageRenderers = {
  home: (_site, page) => renderHome(page),
  services: (_site, page) => renderServices(page),
  prices: (_site, page) => renderPrices(page),
  about: (_site, page) => renderAbout(page),
  contacts: (site, page) => renderContacts(site, page),
  notFound: (_site, page) => renderNotFound(page),
};

const slugify = (value = "") =>
  value
    .toLowerCase()
    .replaceAll(" ", "-")
    .replace(/[^\p{Letter}\p{Number}-]+/gu, "")
    .slice(0, 80);

const schemaPriceFromText = (value = "") => {
  const prices = String(value).match(/\d+(?:[.,]\d+)?/g);

  return prices?.at(-1)?.replace(",", ".") || "";
};

const schemaNameForPriceRow = (row) => {
  if (row.service) {
    return row.service;
  }

  if (row.format) {
    return row.format;
  }

  return [row.category, row.package].filter(Boolean).join(" ");
};

const breadcrumbJsonLd = (site, page) => ({
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Головна",
      item: `${site.url}/`,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: page.breadcrumb,
      item: canonicalUrl(site, page),
    },
  ],
});

const localBusinessJsonLd = (site, page) => ({
  "@type": ["MedicalBusiness", "LocalBusiness"],
  name: site.name,
  alternateName: site.alternateName,
  url: canonicalUrl(site, page),
  image: absoluteUrl(site, site.heroImage),
  telephone: site.phone,
  priceRange: site.priceRange,
  openingHours: page.path === "/contacts/" ? site.openingHours : undefined,
  address: {
    "@type": "PostalAddress",
    streetAddress: site.address.streetAddress,
    addressLocality: site.address.addressLocality,
    postalCode: site.address.postalCode,
    addressCountry: site.address.addressCountry,
  },
  areaServed: site.areaServed,
  sameAs: [site.links.telegram, site.links.instagram, site.links.maps],
  medicalSpecialty: page.path === "/" ? site.medicalSpecialty : undefined,
});

const cleanJsonLd = (value) => {
  if (Array.isArray(value)) {
    return value.map(cleanJsonLd);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, cleanJsonLd(entryValue)]),
    );
  }

  return value;
};

function renderStructuredData(site, page) {
  let data;

  if (page.path === "/") {
    data = {
      "@context": "https://schema.org",
      ...localBusinessJsonLd(site, page),
    };
  }

  if (page.path === "/services/") {
    data = {
      "@context": "https://schema.org",
      "@graph": [
        breadcrumbJsonLd(site, page),
        {
          "@type": "ItemList",
          name: "Послуги Recovery Line",
          itemListElement: page.overview.details.map((item, index) => ({
            "@type": "Service",
            position: index + 1,
            name: item.title,
            areaServed: site.areaServed,
          })),
        },
      ],
    };
  }

  if (page.path === "/prices/") {
    data = {
      "@context": "https://schema.org",
      "@graph": [
        breadcrumbJsonLd(site, page),
        {
          "@type": "OfferCatalog",
          name: "Прайс Recovery Line",
          url: canonicalUrl(site, page),
          itemListElement: page.tables
            .flatMap((table) => table.rows)
            .map((row) => ({
              ...row,
              schemaName: schemaNameForPriceRow(row),
              schemaPrice: schemaPriceFromText(row.price),
            }))
            .filter((row) => row.schemaName && row.schemaPrice)
            .map((row) => ({
              "@type": "Offer",
              name: row.schemaName,
              price: row.schemaPrice,
              priceCurrency: "UAH",
            })),
        },
      ],
    };
  }

  if (page.path === "/about/") {
    data = {
      "@context": "https://schema.org",
      "@graph": [
        breadcrumbJsonLd(site, page),
        {
          "@type": "Organization",
          name: site.name,
          alternateName: site.alternateName,
          url: canonicalUrl(site, page),
          member: page.team.members.map((member) => ({
            "@type": "Person",
            name: member.name,
            jobTitle: member.role,
          })),
        },
      ],
    };
  }

  if (page.path === "/contacts/") {
    data = {
      "@context": "https://schema.org",
      "@graph": [breadcrumbJsonLd(site, page), localBusinessJsonLd(site, page)],
    };
  }

  if (!data) {
    return "";
  }

  return `<script type="application/ld+json">
${escapeJsonForHtml(cleanJsonLd(data))}
    </script>`;
}

const renderDocument = (site, navigation, pageKey, page) => `<!doctype html>
<html lang="${escapeHtml(site.language)}">

${renderHead(site, page)}

<body>
  <a class="skip-link" href="#main">Перейти до вмісту</a>
  ${renderHeader(site, navigation, pageKey, page)}

  <main id="main">
    ${pageRenderers[pageKey](site, page)}
  </main>

  ${renderFooter(site)}
</body>

</html>
`;

const renderSitemap = (site, pages) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Object.values(pages)
  .map(
    (page) => `  <url>
    <loc>${escapeHtml(canonicalUrl(site, page))}</loc>
    <priority>${escapeHtml(page.priority)}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;

const renderRobots = (site) => `User-agent: *
Allow: /

Sitemap: ${site.url}/sitemap.xml
`;

const writeOutput = async (filePath, contents) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
};

const { site, navigation } = await readJson(path.join(root, "content/site.json"));
const pages = Object.fromEntries(
  await Promise.all(
    pageKeys.map(async (key) => [key, await readJson(path.join(root, `content/pages/${key}.json`))]),
  ),
);
const notFoundPage = {
  path: "/404.html",
  file: "404.html",
  seo: {
    title: `Сторінку не знайдено | ${site.name}`,
    description: "Сторінку не знайдено. Перейдіть на головну сторінку Recovery Line.",
    robots: "noindex,follow",
    ogTitle: `Сторінку не знайдено | ${site.name}`,
    ogDescription: "Сторінку не знайдено. Перейдіть на головну сторінку Recovery Line.",
    ogImage: site.logo,
  },
  hero: {
    eyebrow: "404",
    title: "Сторінку не знайдено",
    lead: "Можливо, адреса змінилася або сторінку було видалено. Перейдіть на головну, щоб знайти потрібну інформацію.",
    buttonLabel: "На головну",
  },
};

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await cp(path.join(root, "assets"), path.join(outDir, "assets"), {
  recursive: true,
  filter: (source) => path.basename(source) !== ".DS_Store",
});

await Promise.all(
  pageKeys.flatMap((key) => {
    const document = renderDocument(site, navigation, key, pages[key]);

    return [
      writeOutput(path.join(root, pages[key].file), document),
      writeOutput(path.join(outDir, pages[key].file), document),
    ];
  }),
);
const notFoundDocument = renderDocument(site, navigation, "notFound", notFoundPage);
await Promise.all([
  writeFile(path.join(root, notFoundPage.file), notFoundDocument),
  writeFile(path.join(outDir, notFoundPage.file), notFoundDocument),
  writeFile(path.join(root, "sitemap.xml"), renderSitemap(site, pages)),
  writeFile(path.join(outDir, "sitemap.xml"), renderSitemap(site, pages)),
  writeFile(path.join(root, "robots.txt"), renderRobots(site)),
  writeFile(path.join(outDir, "robots.txt"), renderRobots(site)),
]);

console.log(`Built ${pageKeys.length} pages and 404.html from content JSON into dist/.`);
