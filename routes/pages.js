// Storefront pages (server-rendered).
const express = require("express");
const router = express.Router();

const Product = require("../models/Product");
const Category = require("../models/Category");
const Weblog = require("../models/Weblog");
const Order = require("../models/Order");
const Review = require("../models/Review");
const User = require("../models/User");
const catalog = require("../lib/catalog");
const listing = require("../lib/listing");
const cartService = require("../lib/cart");
const payment = require("../lib/payment");
const config = require("../config");
const { pageLocals } = require("../middlewares/locals");
const { requireUser } = require("../middlewares/auth");
const { asyncHandler, HttpError, str } = require("../lib/util");
const { SitemapStream, streamToPromise } = require("sitemap");
const sanitize = require("../lib/sanitize");

const CARD_FIELDS = "name slug images price offerPrice countInStock isNewProduct sizes colors rating reviewsNum";

router.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin",
      "Disallow: /api/",
      "Disallow: /cart",
      "Disallow: /checkout",
      "Disallow: /account",
      "Disallow: /userProfile",
      "Disallow: /*?*sort=",
      "",
      `Sitemap: ${config.siteUrl}/sitemap.xml`,
      "",
    ].join("\n")
  );
});

let sitemapCache = null;
let sitemapAt = 0;
router.get(
  "/sitemap.xml",
  asyncHandler(async (req, res) => {
    if (!sitemapCache || Date.now() - sitemapAt > 3600_000) {
      const sm = new SitemapStream({ hostname: config.siteUrl });
      [
        ["/", 1.0, "daily"],
        ["/shop", 0.9, "daily"],
        ["/weblog", 0.7, "weekly"],
        ["/about-us", 0.4, "monthly"],
        ["/contact-us", 0.4, "monthly"],
        ["/connect-us", 0.3, "monthly"],
        ["/terms-and-conditions", 0.2, "yearly"],
        ["/privacy-policy", 0.2, "yearly"],
      ].forEach(([url, priority, changefreq]) => sm.write({ url, priority, changefreq }));
      const [products, cats, posts] = await Promise.all([
        Product.find(catalog.PUBLIC).select("slug updatedAt images").lean({ getters: false }),
        Category.find({ categoryType: "product", isActive: true }).select("slug updatedAt").lean(),
        Weblog.find({ isPublished: true }).select("slug updatedAt").lean(),
      ]);
      products.forEach((p) =>
        sm.write({
          url: `/productDetails/${p.slug}`,
          priority: 0.8,
          changefreq: "weekly",
          lastmod: p.updatedAt?.toISOString(),
          img: (p.images || []).slice(0, 3).map((i) => ({ url: i.url.startsWith("http") ? i.url : config.siteUrl + i.url })),
        })
      );
      cats.forEach((c) => sm.write({ url: `/category/${c.slug}`, priority: 0.7, changefreq: "weekly", lastmod: c.updatedAt?.toISOString() }));
      posts.forEach((w) => sm.write({ url: `/weblog/${w.slug}`, priority: 0.6, changefreq: "monthly", lastmod: w.updatedAt?.toISOString() }));
      sm.end();
      sitemapCache = await streamToPromise(sm);
      sitemapAt = Date.now();
    }
    res.type("application/xml").send(sitemapCache);
  })
);

router.use(pageLocals);

// ───────────── Home ─────────────
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const pub = catalog.PUBLIC;
    const [categories, newest, featured, popular, onSale, posts] = await Promise.all([
      catalog.countsByRoot(),
      Product.find({ ...pub, countInStock: { $gt: 0 } }).sort({ isNewProduct: -1, createdAt: -1 }).limit(10).select(CARD_FIELDS).lean({ getters: false }),
      Product.find({ ...pub, isFeatured: true }).sort({ createdAt: -1 }).limit(10).select(CARD_FIELDS).lean({ getters: false }),
      Product.find({ ...pub, isPopular: true }).sort({ createdAt: -1 }).limit(10).select(CARD_FIELDS).lean({ getters: false }),
      Product.find({ ...pub, offerPrice: { $gt: 0 }, countInStock: { $gt: 0 } }).sort({ discount: -1 }).limit(10).select(CARD_FIELDS).lean({ getters: false }),
      Weblog.find({ isPublished: true }).sort({ publishedAt: -1, createdAt: -1 }).limit(3).select("title slug description images readingTime publishedAt createdAt").lean(),
    ]);
    res.render("pages/home", {
      title: "کیدل | فروشگاه آنلاین لباس بچگانه و نوزادی",
      description:
        "خرید آنلاین لباس بچگانه، نوزادی و نوجوان با کیفیت بالا و قیمت مناسب از کیدل. انتخاب سایز آسان، پرداخت امن و ارسال به سراسر ایران.",
      categories: categories.filter((c) => c.productCount > 0 || categories.length <= 8),
      newest,
      featured,
      popular,
      onSale: onSale.filter((p) => p.offerPrice < p.price),
      posts,
    });
  })
);

// ───────────── Listings ─────────────
async function renderListing(req, res, { category, basePath, title, description, heading, crumbs, searchPage }) {
  const data = await listing.run({ query: req.query, category });
  // Live "N products match" count for the mobile filter sheet.
  if (req.query._count === "1") return res.json({ success: true, total: data.total });
  const qs = { ...req.query };
  const isFiltered = data.active.length > 0 || data.filters.sort !== "newest";
  res.render("pages/listing", {
    ...data,
    title,
    description,
    heading,
    crumbs,
    category,
    basePath,
    searchPage,
    query: qs,
    urlWith: (changes) => listing.urlWith(basePath, qs, { ...changes }),
    // Filtered/sorted/paged variants point search engines at the clean listing.
    canonical: config.siteUrl + basePath + (data.page > 1 && !isFiltered ? `?page=${data.page}` : ""),
    noindex: searchPage || (isFiltered && data.active.length > 1),
  });
}

router.get(
  "/shop",
  asyncHandler(async (req, res) => {
    await renderListing(req, res, {
      basePath: "/shop",
      title: "فروشگاه لباس بچگانه | کیدل",
      description: "همه لباس‌های بچگانه، نوزادی و نوجوان کیدل؛ فیلتر بر اساس سایز، رنگ و قیمت.",
      heading: "همه محصولات",
      crumbs: [{ name: "فروشگاه" }],
    });
  })
);

router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const q = str(req.query.q, 80);
    await renderListing(req, res, {
      basePath: "/search",
      searchPage: true,
      title: q ? `جستجوی «${q}» | کیدل` : "جستجو | کیدل",
      description: "جستجو در محصولات کیدل",
      heading: q ? `نتایج «${q}»` : "جستجو",
      crumbs: [{ name: "جستجو" }],
    });
  })
);

router.get(
  "/category/:slug",
  asyncHandler(async (req, res) => {
    const category = await Category.findOne({ slug: req.params.slug, categoryType: "product", isActive: true }).lean();
    if (!category) throw new HttpError(404, "دسته‌بندی پیدا نشد");
    const tree = await catalog.loadTree();
    const node = tree.byId.get(String(category._id));
    const crumbs = await catalog.breadcrumbFor(category);
    res.locals.subcategories = node ? node.children : [];
    await renderListing(req, res, {
      category,
      basePath: `/category/${category.slug}`,
      title: `خرید ${category.name} | کیدل`,
      description: category.metaDescription || `خرید آنلاین ${category.name} بچگانه با بهترین کیفیت و قیمت از فروشگاه کیدل.`,
      heading: category.name,
      crumbs: crumbs.map((c, i) => (i === crumbs.length - 1 ? { name: c.name } : { name: c.name, url: `/category/${c.slug}` })),
    });
  })
);

// ───────────── Product ─────────────
router.get(
  "/productDetails/:slug",
  asyncHandler(async (req, res) => {
    const product = await Product.findOne({ slug: req.params.slug, ...catalog.PUBLIC })
      .populate("category", "name slug")
      .populate("brand", "name")
      .lean({ getters: false });
    if (!product) throw new HttpError(404, "این محصول پیدا نشد یا دیگر موجود نیست");

    const primaryCat = product.category?.[0];
    const crumbs = primaryCat ? await catalog.breadcrumbFor(primaryCat) : [];
    const catIds = (product.category || []).map((c) => c._id);
    const [related, reviewCount] = await Promise.all([
      Product.find({ ...catalog.PUBLIC, _id: { $ne: product._id }, category: { $in: catIds } })
        .sort({ countInStock: -1, createdAt: -1 })
        .limit(10)
        .select(CARD_FIELDS)
        .lean({ getters: false }),
      Review.countDocuments({ product: product._id, status: "approved" }),
    ]);

    product.description = sanitize.rich(product.description || "");
    res.render("pages/product", {
      product,
      related,
      reviewCount,
      crumbs: [{ name: "فروشگاه", url: "/shop" }, ...crumbs.map((c) => ({ name: c.name, url: `/category/${c.slug}` })), { name: product.name }],
      title: `${product.name} | خرید آنلاین از کیدل`,
      description: (product.lilDescription || `خرید ${product.name} با بهترین قیمت و ارسال به سراسر ایران از کیدل`).slice(0, 158),
      ogImage: product.images?.[0]?.url,
      ogType: "product",
      canonical: `${config.siteUrl}/productDetails/${product.slug}`,
      // In-stock products replace the bottom nav with a sticky "add to cart" bar.
      hideBottomNav: product.countInStock > 0,
    });
  })
);

// ───────────── Cart & checkout ─────────────
router.get(
  "/cart",
  asyncHandler(async (req, res) => {
    const cart = await cartService.build(req);
    res.render("pages/cart", { cart, title: "سبد خرید | کیدل", noindex: true });
  })
);

router.get(
  "/checkout",
  requireUser,
  asyncHandler(async (req, res) => {
    const cart = await cartService.build(req);
    if (!cart.items.length) return res.redirect("/cart");
    const user = await User.findById(req.session.userId).select("fullName mobile savedAddress").lean();
    res.render("pages/checkout", {
      provinces: require("../lib/iran"),
      cart,
      prefill: {
        recipientName: user.savedAddress?.recipientName || user.fullName || "",
        recipientPhone: user.savedAddress?.recipientPhone || user.mobile,
        province: user.savedAddress?.province || "",
        city: user.savedAddress?.city || "",
        address: user.savedAddress?.address || "",
        postcode: user.savedAddress?.postcode || "",
      },
      hasSaved: !!user.savedAddress?.address,
      checkoutKey: require("crypto").randomUUID(),
      title: "تکمیل خرید | کیدل",
      noindex: true,
      hideBottomNav: true,
      minimalHeader: true,
    });
  })
);

router.get(
  "/checkout/result{/:orderNum}",
  asyncHandler(async (req, res) => {
    let order = null;
    if (req.params.orderNum && req.session.userId) {
      order = await Order.findOne({ OrderNum: str(req.params.orderNum, 40), user: req.session.userId }).lean();
    }
    let state = "unknown";
    if (order) {
      if (order.paymentStatus === "پرداخت شده") state = "success";
      else if (order.status === "در انتظار پرداخت" && !order.reservation?.released) state = "pending";
      else state = "failed";
    }
    res.render("pages/payment-result", {
      order,
      state,
      title: state === "success" ? "سفارش ثبت شد | کیدل" : "نتیجه پرداخت | کیدل",
      noindex: true,
    });
  })
);

// ───────────── Account ─────────────
router.get("/userProfile", (req, res) => res.redirect(301, "/account"));

router.get(
  "/account",
  requireUser,
  asyncHandler(async (req, res) => {
    const [profile, orders] = await Promise.all([
      User.findById(req.session.userId).select("fullName mobile email savedAddress createdAt").lean(),
      Order.find({ user: req.session.userId }).sort({ createdAt: -1 }).limit(3).lean(),
    ]);
    const counts = await Order.aggregate([
      { $match: { user: profile._id } },
      { $group: { _id: "$paymentStatus", n: { $sum: 1 } } },
    ]);
    res.render("pages/account", {
      profile,
      orders,
      paidCount: counts.find((c) => c._id === "پرداخت شده")?.n || 0,
      title: "حساب کاربری | کیدل",
      noindex: true,
      tab: "overview",
    });
  })
);

router.get(
  "/account/orders",
  requireUser,
  asyncHandler(async (req, res) => {
    const filter = str(req.query.f, 20);
    const q = { user: req.session.userId };
    if (filter === "active") q.status = { $in: ["در حال پردازش", "بسته بندی شده", "در حال ارسال"] };
    if (filter === "done") q.status = "تحویل داده شد";
    if (filter === "cancelled") q.status = "لغو شده";
    const orders = await Order.find(q).sort({ createdAt: -1 }).limit(100).lean();
    res.render("pages/orders", { orders, filter, title: "سفارش‌های من | کیدل", noindex: true, tab: "orders" });
  })
);

router.get(
  "/account/orders/:orderNum",
  requireUser,
  asyncHandler(async (req, res) => {
    const order = await Order.findOne({ OrderNum: str(req.params.orderNum, 40), user: req.session.userId })
      .populate("products.product", "slug images")
      .lean({ getters: false });
    if (!order) throw new HttpError(404, "سفارش پیدا نشد");
    res.render("pages/order", { order, title: `سفارش ${order.OrderNum} | کیدل`, noindex: true, tab: "orders" });
  })
);

// ───────────── Blog ─────────────
router.get(
  "/weblog",
  asyncHandler(async (req, res) => {
    const cats = await Category.find({ categoryType: "weblog", isActive: true }).select("name slug").lean();
    const catSlug = str(req.query.cat, 80);
    const active = cats.find((c) => c.slug === catSlug);
    const filter = { isPublished: true, ...(active ? { categories: active._id } : {}) };
    const posts = await Weblog.find(filter)
      .sort({ isFeatured: -1, publishedAt: -1, createdAt: -1 })
      .limit(60)
      .select("title slug description images readingTime publishedAt createdAt categories isFeatured")
      .populate("categories", "name slug")
      .lean();
    res.render("pages/blog", {
      posts,
      cats,
      active,
      title: "مجله کیدل | راهنمای خرید و نگهداری لباس کودک",
      description: "مقاله‌های کاربردی درباره انتخاب سایز، خرید و نگهداری لباس بچه‌ها.",
      noindex: !!active,
    });
  })
);

router.get(
  "/weblog/:slug",
  asyncHandler(async (req, res) => {
    const post = await Weblog.findOne({ slug: req.params.slug, isPublished: true }).populate("categories", "name slug").populate("author", "fullName").lean();
    if (!post) throw new HttpError(404, "این مقاله پیدا نشد");
    Weblog.updateOne({ _id: post._id }, { $inc: { viewCount: 1 } }).catch(() => {});
    const related = await Weblog.find({ _id: { $ne: post._id }, isPublished: true, ...(post.categories?.length ? { categories: { $in: post.categories.map((c) => c._id) } } : {}) })
      .sort({ publishedAt: -1 })
      .limit(3)
      .select("title slug images readingTime publishedAt createdAt")
      .lean();
    post.content = sanitize.rich(post.content || "");
    res.render("pages/post", {
      post,
      related,
      title: `${post.metaTitle || post.title} | مجله کیدل`,
      description: post.metaDescription || post.description,
      ogImage: post.images?.[0]?.url,
      ogType: "article",
    });
  })
);

// ───────────── Content pages ─────────────
const content = require("../views/content/pages");
Object.entries(content).forEach(([path, page]) => {
  router.get(path, (req, res) => res.render("pages/content", { page, title: `${page.title} | کیدل`, description: page.description }));
});

// ───────────── Dev-only fake payment gateway ─────────────
if (payment.useMock) {
  router.get("/dev/fake-gateway", (req, res) => {
    res.render("pages/dev-gateway", { authority: str(req.query.Authority, 64), amount: str(req.query.amount, 20), title: "درگاه آزمایشی", noindex: true, minimalHeader: true, hideBottomNav: true });
  });
}

module.exports = router;
