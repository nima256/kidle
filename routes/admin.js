const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const mongoose = require("mongoose");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Category = require("../models/Category");
const Brand = require("../models/Brand");
const DiscountCode = require("../models/DiscountCode");

const { getPersianDate } = require("../helper/getPersianDate");
const Weblog = require("../models/Weblog");

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = "public/uploads/temp";
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

const retryUnlink = async (filePath, retries = 5, delay = 100) => {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.promises.unlink(filePath);
      return;
    } catch (err) {
      if (err.code === "EPERM" || err.code === "EBUSY") {
        // Try again after delay
        await new Promise((res) => setTimeout(res, delay));
      } else {
        throw err; // Unknown error, rethrow
      }
    }
  }

  throw new Error(
    `Failed to delete file after ${retries} attempts: ${filePath}`
  );
};

const processImages = async (req, res, next) => {
  if (!req.files || req.files.length === 0) return next();

  try {
    const processedImages = [];

    for (const file of req.files) {
      const outputPath = path.join(
        "public/uploads",
        path.basename(file.path, path.extname(file.path)) + ".webp"
      );

      try {
        // Process image
        await sharp(file.path)
          .webp({ quality: 80 })
          .resize(1200, 1200, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .toFile(outputPath);

        // Manually null the sharp instance (optional but may help)
        sharp.cache(false); // Disable caching globally (can help)

        processedImages.push({
          url: `/uploads/${path.basename(outputPath)}`,
          filename: path.basename(outputPath),
        });
      } finally {
        const tempFilePath = file.path;

        try {
          await retryUnlink(tempFilePath);
        } catch (err) {
          console.error(
            `Still could not delete temp file ${tempFilePath}:`,
            err
          );
        }
      }
    }

    req.processedImages = processedImages;
    next();
  } catch (err) {
    next(err);
  }
};


router.post(
  "/upload-image",
  upload.single("image"),  // Multer first to process the upload
  async (req, res, next) => {
    // Convert single file to array format that processImages expects
    if (req.file) {
      req.files = [req.file];
    }
    next();
  },
  processImages,  // Then process the image
  async (req, res) => {
    try {
      if (!req.processedImages || req.processedImages.length === 0) {
        return res.status(400).json({ error: "No image processed" });
      }

      const processedImage = req.processedImages[0];
      res.json({
        success: true,
        url: processedImage.url,
        filename: processedImage.filename
      });
    } catch (error) {
      console.error("Image upload error:", error);
      res.status(500).json({
        error: "Error processing image",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

router.post(
  "/upload-images",
  upload.array("images"),
  processImages,
  async (req, res) => {
    try {
      if (!req.processedImages || req.processedImages.length === 0) {
        return res.status(400).json({ error: "هیچ عکسی پردازش نشد" });
      }

      // Return relative URLs instead of absolute ones
      const processedImages = req.processedImages.map((img) => ({
        url: img.url.replace(/^https?:\/\/[^/]+/, ""), // Remove domain part
        filename: img.filename,
      }));

      res.status(200).json({
        success: true,
        images: processedImages,
      });
    } catch (error) {
      console.error("Image upload error:", error);

      // Additional cleanup if error occurs
      if (req.processedImages) {
        req.processedImages.forEach((img) => {
          const filePath = path.join("public/uploads", img.filename);
          try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch (err) {
            console.error(`Error cleaning up ${filePath}:`, err);
          }
        });
      }

      res.status(500).json({
        error: "ارور در آپلود عکس",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

router.delete("/delete-image", async (req, res) => {
  try {
    const { filename } = req.body;

    if (!filename) {
      return res.status(400).json({ error: "Filename is required" });
    }

    const filePath = path.join("public/uploads", filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.status(200).json({ success: true });
    } else {
      res.status(404).json({ error: "File not found" });
    }
  } catch (error) {
    console.error("Image deletion error:", error);
    res.status(500).json({
      error: "Failed to delete image",
      details: error.message,
    });
  }
});

router.get("/login", async (req, res) => {
  res.render("adminlogin");
});

router.get("/", async (req, res) => {
  const users = await User.find({});
  const products = await Product.find({})
    .populate("category")
    .populate("brand");
  const categories = await Category.find({ categoryType: "product" });
  const orders = await Order.find({}).populate("user").populate("products");
  const brands = await Brand.find({});
  const discounts = await DiscountCode.find({});
  const weblogs = await Weblog.find({})

  const statusCounts = {
    pendingProcessing: await Order.countDocuments({ status: "در حال پردازش" }),
    inShipping: await Order.countDocuments({ status: "در حال ارسال" }),
    delivered: await Order.countDocuments({ status: "تحویل داده شد" }),
    cancelled: await Order.countDocuments({ status: "لغو شده" }),
    totalOrders: orders.length,
  };

  res.render("AdminPanel", {
    users,
    products,
    categories,
    orders,
    brands,
    statusCounts,
    discounts,
    weblogs
  });
});

router.post("/products/add", async (req, res) => {
  try {
    // Calculate discount percentage if offerPrice exists
    let discount = null;
    if (req.body.offerPrice && req.body.price) {
      discount = Math.round(
        ((req.body.price - req.body.offerPrice) / req.body.price) * 100
      );
    }

    const productData = {
      ...req.body,
      images: req.body.images || [],
      discount,
      createTarikh: getPersianDate(),
      updateTarikh: getPersianDate(),
    };

    const product = new Product(productData);
    await product.save();

    const populatedProduct = await Product.findById(product._id)
      .populate("brand", "name") // Only populate the name field
      .populate("category", "name"); // Only populate the name field

    if (populatedProduct.category && populatedProduct.category.length > 0) {
      populatedProduct.catName = populatedProduct.category[0].name;
      await populatedProduct.save();
    }

    res.status(201).json({
      success: true,
      message: "محصول با موفقیت ایجاد شد",
      product: populatedProduct,
    });
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({
      success: false,
      message: "خطای سرور در ایجاد محصول",
      error: error.message,
    });
  }
});

const validateProductUpdate = [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage("نام محصول باید بین ۳ تا ۱۰۰ کاراکتر باشد"),
  body("lilDescription")
    .optional()
    .trim()
    .isLength({ max: 160 })
    .withMessage("توضیح کوتاه نمی‌تواند بیشتر از ۱۶۰ کاراکتر باشد"),
  body("description")
    .optional()
    .trim()
    .isLength({ min: 20 })
    .withMessage("توضیحات محصول نمی‌تواند کمتر از ۲۰ کاراکتر باشد"),
  body("price")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("قیمت محصول نمی‌تواند منفی باشد"),
  body("offerPrice")
    .optional({ nullable: true, checkFalsy: true })
    .custom((value, { req }) => {
      if (value !== null && value !== undefined) {
        if (value >= req.body.price) {
          throw new Error("قیمت ویژه باید کمتر از قیمت اصلی باشد");
        }
      }
      return true;
    }),
  body("countInStock")
    .optional()
    .isInt({ min: 0 })
    .withMessage("موجودی نمی‌تواند منفی باشد"),
  body("rating")
    .optional()
    .isFloat({ min: 0, max: 5 })
    .withMessage("امتیاز باید بین ۰ تا ۵ باشد"),
  body("weight")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("وزن نمی‌تواند منفی باشد"),
  body("discount")
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage("تخفیف باید بین ۰ تا ۱۰۰ باشد"),
  body("category")
    .optional()
    .isArray()
    .withMessage("دسته‌بندی باید آرایه باشد"),
  body("category.*")
    .optional()
    .isMongoId()
    .withMessage("شناسه دسته‌بندی نامعتبر است"),
  body("brand").optional().isMongoId().withMessage("شناسه برند نامعتبر است"),
  body("colors.*.name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("نام رنگ الزامی است"),
  body("colors.*.rgb")
    .optional()
    .trim()
    .isHexColor()
    .withMessage("کد رنگ باید به صورت HEX باشد"),
  body("sizes.*.size")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("سایز الزامی است"),
  body("sizes.*.usage")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("کاربرد سایز الزامی است"),
  body("specifications.*.key")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("کلید مشخصه الزامی است"),
  body("specifications.*.value")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("مقدار مشخصه الزامی است"),
  body("tags.*")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("برچسب نمی‌تواند خالی باشد"),
];

router.put("/products/edit/:id", validateProductUpdate, async (req, res) => {
  try {
    // بررسی خطاهای اعتبارسنجی
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "خطا در اعتبارسنجی",
        errors: errors.array(),
      });
    }

    const productId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "شناسه محصول نامعتبر است",
      });
    }

    // یافتن محصول
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "محصول یافت نشد",
      });
    }

    // آماده‌سازی داده‌های به‌روزرسانی
    const updateData = { ...req.body };

    updateData.updateTarikh = getPersianDate();

    // مدیریت قیمت ویژه و تخفیف
    if (updateData.offerPrice === null || updateData.offerPrice === undefined) {
      // اگر قیمت ویژه حذف شده
      updateData.offerPrice = undefined;
      updateData.discount = 0;
    } else if (updateData.offerPrice) {
      // اگر قیمت ویژه وجود دارد
      const price = updateData.price || product.price;
      updateData.discount = Math.round(
        ((price - updateData.offerPrice) / price) * 100
      );
    }

    // حذف فیلد offerPrice اگر null است
    if (updateData.offerPrice === null) {
      delete updateData.offerPrice;
    }

    // مدیریت تصاویر
    if (updateData.images && Array.isArray(updateData.images)) {
      // You might want to merge with existing images or replace them
      // This example replaces all images with the new array
      updateData.images = updateData.images;
    }

    // مدیریت آرایه‌ها
    const arrayFields = [
      "colors",
      "sizes",
      "specifications",
      "tags",
      "category",
    ];
    arrayFields.forEach((field) => {
      if (req.body[field] && Array.isArray(req.body[field])) {
        updateData[field] = req.body[field];
      } else {
        updateData[field] = [];
      }
    });

    // محاسبه تخفیف اگر قیمت ویژه تغییر کرده
    if (updateData.offerPrice === null || updateData.offerPrice === undefined) {
      updateData.offerPrice = undefined;
      updateData.discount = 0;
    } else if (updateData.offerPrice) {
      const price = updateData.price || product.price;
      updateData.discount = Math.round(
        ((price - updateData.offerPrice) / price) * 100
      );
    }

    // به‌روزرسانی محصول
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    )
      .populate("category")
      .populate("brand");

    res.json({
      success: true,
      message: "محصول با موفقیت به‌روزرسانی شد",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("خطا در ویرایش محصول:", error);
    res.status(500).json({
      success: false,
      message: "خطای سرور در ویرایش محصول",
      error: error.message,
    });
  }
});

router.delete("/products/delete/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "محصول یافت نشد",
      });
    }

    await Product.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "محصول با موفقیت حذف شد",
      deletedProductId: req.params.id,
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({
      success: false,
      message: "خطای سرور در حذف محصول",
      error: error.message,
    });
  }
});

router.post("/categories/add", async (req, res) => {
  try {
    const { name, categoryType = "product", parentId = null } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "نام دسته‌بندی الزامی است",
      });
    }

    const category = new Category({
      name,
      categoryType,
      parentId: parentId || null,
    });

    await category.save();

    res.status(201).json({
      success: true,
      message: "دسته‌بندی با موفقیت ایجاد شد",
      category,
    });
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({
      success: false,
      message: "خطا در ایجاد دسته‌بندی",
      error: error.message,
    });
  }
});

router.put("/categories/edit/:id", async (req, res) => {
  try {
    const { name, categoryType, parentId } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "نام دسته‌بندی الزامی است",
      });
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,
      {
        name,
        categoryType: categoryType || "product",
        parentId: parentId || null,
        updateTarikh: getPersianDate(),
      },
      { new: true, runValidators: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({
        success: false,
        message: "دسته‌بندی یافت نشد",
      });
    }

    res.json({
      success: true,
      message: "دسته‌بندی با موفقیت ویرایش شد",
      category: updatedCategory,
    });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({
      success: false,
      message: "خطا در ویرایش دسته‌بندی",
      error: error.message,
    });
  }
});

router.delete("/categories/delete/:id", async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "دسته‌بندی یافت نشد",
      });
    }

    res.json({
      success: true,
      message: "دسته‌بندی با موفقیت حذف شد",
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({
      success: false,
      message: "خطا در حذف دسته‌بندی",
      error: error.message,
    });
  }
});

// Brand Routes
router.post("/brands/add", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "نام برند الزامی است",
      });
    }

    const brand = new Brand({ name });
    await brand.save();

    res.status(201).json({
      success: true,
      message: "برند با موفقیت ایجاد شد",
      brand,
    });
  } catch (error) {
    console.error("Error creating brand:", error);
    res.status(500).json({
      success: false,
      message: "خطا در ایجاد برند",
      error: error.message,
    });
  }
});

router.put("/brands/edit/:id", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "نام برند الزامی است",
      });
    }

    const updatedBrand = await Brand.findByIdAndUpdate(
      req.params.id,
      {
        name,
        updateTarikh: getPersianDate(),
      },
      { new: true, runValidators: true }
    );

    if (!updatedBrand) {
      return res.status(404).json({
        success: false,
        message: "برند یافت نشد",
      });
    }

    res.json({
      success: true,
      message: "برند با موفقیت ویرایش شد",
      brand: updatedBrand,
    });
  } catch (error) {
    console.error("Error updating brand:", error);
    res.status(500).json({
      success: false,
      message: "خطا در ویرایش برند",
      error: error.message,
    });
  }
});

router.delete("/brands/delete/:id", async (req, res) => {
  try {
    const brand = await Brand.findByIdAndDelete(req.params.id);

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "برند یافت نشد",
      });
    }

    res.json({
      success: true,
      message: "برند با موفقیت حذف شد",
    });
  } catch (error) {
    console.error("Error deleting brand:", error);
    res.status(500).json({
      success: false,
      message: "خطا در حذف برند",
      error: error.message,
    });
  }
});

router.put("/orders/edit/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    if (!status) {
      return res
        .status(400)
        .json({ success: false, message: "وضعیت جدید الزامی است" });
    }

    const validStatuses = [
      "در انتظار پرداخت",
      "در حال پردازش",
      "بسته بندی شده",
      "در حال ارسال",
      "تحویل داده شد",
      "لغو شده",
    ];

    if (!validStatuses.includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "وضعیت نامعتبر است" });
    }

    const order = await Order.findByIdAndUpdate(
      id,
      {
        status,
        $push: {
          statusHistory: {
            status,
            note: req.body.note || "تغییر وضعیت توسط مدیر",
          },
        },
      },
      { new: true }
    ).populate("user", "fullName email phone");

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "سفارش یافت نشد" });
    }

    res.json({
      success: true,
      message: "وضعیت سفارش با موفقیت به‌روزرسانی شد",
      data: order,
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({
      success: false,
      message: "خطا در به‌روزرسانی وضعیت سفارش",
      error: error.message,
    });
  }
});

// Duplicate product route
router.post("/products/duplicate/:id", async (req, res) => {
  try {
    const productId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "شناسه محصول نامعتبر است",
      });
    }
    
    // پیدا کردن محصول اصلی
    const originalProduct = await Product.findById(productId)
      .populate("category")
      .populate("brand");
    
    if (!originalProduct) {
      return res.status(404).json({
        success: false,
        message: "محصول یافت نشد",
      });
    }
    
    // آماده‌سازی داده‌های محصول جدید
    const duplicateData = originalProduct.toObject();
    
    // حذف فیلدهایی که نباید کپی شوند
    delete duplicateData._id;
    delete duplicateData.__v;
    delete duplicateData.createdAt;
    delete duplicateData.updatedAt;
    delete duplicateData.slug; // اسلاگ جدید در pre-hook ساخته می‌شود
    
    // تغییر نام محصول
    duplicateData.name = `${originalProduct.name} (کپی)`;
    
    // تنظیم تاریخ‌های جدید
    duplicateData.createTarikh = getPersianDate();
    duplicateData.updateTarikh = getPersianDate();
    
    // بازنشانی آمارها
    duplicateData.rating = 0;
    duplicateData.reviewsNum = 0;
    duplicateData.isNewProduct = true;
    duplicateData.isFeatured = false;
    duplicateData.isPopular = false;
    
    if (duplicateData.weight) {
      // اگر weight از نوع string بود و شامل "گرم" بود
      if (typeof duplicateData.weight === 'string') {
        const weightMatch = duplicateData.weight.match(/(\d+)/);
        if (weightMatch) {
          duplicateData.weight = parseInt(weightMatch[1]);
        } else {
          duplicateData.weight = null;
        }
      }
      // اگر عدد بود، همان را نگه می‌داریم
    }
    
    // کپی کردن تصاویر (اختیاری - می‌توانید مسیرهای جدیدی بسازید)
    // در اینجا تصاویر قبلی را reuse می‌کنیم
    if (originalProduct.images && originalProduct.images.length > 0) {
      duplicateData.images = originalProduct.images.map(img => ({
        url: img.url,
        filename: img.filename
      }));
    } else {
      duplicateData.images = [];
    }
        // اطمینان از اینکه price عدد است
    if (duplicateData.price && typeof duplicateData.price === 'string') {
      duplicateData.price = parseFloat(duplicateData.price);
    }
    
    // اطمینان از اینکه offerPrice عدد است (اگر وجود دارد)
    if (duplicateData.offerPrice) {
      if (typeof duplicateData.offerPrice === 'string') {
        duplicateData.offerPrice = parseFloat(duplicateData.offerPrice);
      }
    } else {
      duplicateData.offerPrice = undefined;
    }
    
    // اطمینان از اینکه countInStock عدد است
    if (duplicateData.countInStock && typeof duplicateData.countInStock === 'string') {
      duplicateData.countInStock = parseInt(duplicateData.countInStock);
    }
    
    // اطمینان از اینکه discount عدد است
    if (duplicateData.discount && typeof duplicateData.discount === 'string') {
      duplicateData.discount = parseInt(duplicateData.discount);
    }
    
    // محاسبه مجدد discount اگر offerPrice وجود دارد
    if (duplicateData.offerPrice && duplicateData.price) {
      duplicateData.discount = Math.round(
        ((duplicateData.price - duplicateData.offerPrice) / duplicateData.price) * 100
      );
    }
    
    // اطمینان از فرمت صحیح آرایه‌ها
    const arrayFields = ['colors', 'sizes', 'specifications', 'tags', 'category'];
    arrayFields.forEach(field => {
      if (!duplicateData[field] || !Array.isArray(duplicateData[field])) {
        duplicateData[field] = [];
      }
    });
    
    // حذف فیلدهای virtual که ممکن است مشکل ایجاد کنند
    delete duplicateData.discountPrice;
    delete duplicateData.categoryDetails;
    delete duplicateData.brandDetails;

    
    // ایجاد محصول جدید
    const newProduct = new Product(duplicateData);
    await newProduct.save();
    
    // populate کردن اطلاعات مورد نیاز
    const populatedProduct = await Product.findById(newProduct._id)
      .populate("brand", "name")
      .populate("category", "name");
    
    res.status(201).json({
      success: true,
      message: "محصول با موفقیت کپی شد",
      product: populatedProduct,
    });
    
  } catch (error) {
    console.error("Error duplicating product:", error);
    res.status(500).json({
      success: false,
      message: "خطای سرور در کپی کردن محصول",
      error: error.message,
    });
  }
});

router.post("/discounts/add", async (req, res) => {
    try {
        const { 
            code, 
            type, 
            amount, 
            minOrderAmount, 
            usageLimit, 
            expireDate, 
            isActive, 
            description,
            maxDiscountAmount 
        } = req.body;
        
        // بررسی وجود کد تکراری
        const existingDiscount = await DiscountCode.findOne({ code: code.toUpperCase() });
        if (existingDiscount) {
            return res.status(400).json({ message: "این کد تخفیف قبلاً وجود دارد" });
        }
        
        const newDiscountData = {
            code: code.toUpperCase(),
            type,
            amount,
            minOrderAmount: minOrderAmount || null,
            usageLimit: usageLimit || null,
            expireDate: expireDate || null,
            isActive: isActive !== undefined ? isActive : true,
            description: description || null,
            usedCount: 0
        };
        
        // اضافه کردن maxDiscountAmount برای تخفیف درصدی
        if (type === 'percent' && maxDiscountAmount) {
            newDiscountData.maxDiscountAmount = maxDiscountAmount;
        }
        
        const newDiscount = new DiscountCode(newDiscountData);
        
        await newDiscount.save();
        
        res.status(201).json({ 
            success: true, 
            message: "کد تخفیف با موفقیت اضافه شد",
            discount: newDiscount 
        });
        
    } catch (error) {
        console.error("Error adding discount:", error);
        
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ message: messages.join(', ') });
        }
        
        res.status(500).json({ message: "خطا در افزودن کد تخفیف", error: error.message });
    }
});

// ویرایش کد تخفیف
router.put("/discounts/edit/:id", async (req, res) => {
    try {
        const { id } = req.params;
        
        // بررسی معتبر بودن ID
        if (!id || id === 'undefined') {
            return res.status(400).json({ message: "شناسه تخفیف معتبر نیست" });
        }
        
        const { 
            code, 
            type, 
            amount, 
            minOrderAmount, 
            usageLimit, 
            expireDate, 
            isActive, 
            description,
            maxDiscountAmount 
        } = req.body;
        
        // بررسی وجود کد تکراری (به غیر از خودش)
        const existingDiscount = await DiscountCode.findOne({ 
            code: code.toUpperCase(),
            _id: { $ne: id }
        });
        
        if (existingDiscount) {
            return res.status(400).json({ message: "این کد تخفیف قبلاً وجود دارد" });
        }
        
        const updateData = {
            code: code.toUpperCase(),
            type,
            amount,
            minOrderAmount: minOrderAmount || null,
            usageLimit: usageLimit || null,
            expireDate: expireDate || null,
            isActive: isActive !== undefined ? isActive : true,
            description: description || null
        };
        
        // اضافه کردن maxDiscountAmount برای تخفیف درصدی
        if (type === 'percent' && maxDiscountAmount) {
            updateData.maxDiscountAmount = maxDiscountAmount;
        } else if (type === 'amount') {
            updateData.maxDiscountAmount = null;
        }
        
        const updatedDiscount = await DiscountCode.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );
        
        if (!updatedDiscount) {
            return res.status(404).json({ message: "کد تخفیف یافت نشد" });
        }
        
        res.json({ 
            success: true, 
            message: "کد تخفیف با موفقیت ویرایش شد",
            discount: updatedDiscount 
        });
        
    } catch (error) {
        console.error("Error editing discount:", error);
        
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ message: messages.join(', ') });
        }
        
        res.status(500).json({ message: "خطا در ویرایش کد تخفیف", error: error.message });
    }
});

// حذف کد تخفیف
router.delete("/discounts/delete/:id", async (req, res) => {
    try {
        const { id } = req.params;
        
        // بررسی معتبر بودن ID
        if (!id || id === 'undefined') {
            return res.status(400).json({ message: "شناسه تخفیف معتبر نیست" });
        }
        
        const deletedDiscount = await DiscountCode.findByIdAndDelete(id);
        
        if (!deletedDiscount) {
            return res.status(404).json({ message: "کد تخفیف یافت نشد" });
        }
        
        res.json({ 
            success: true, 
            message: "کد تخفیف با موفقیت حذف شد" 
        });
        
    } catch (error) {
        console.error("Error deleting discount:", error);
        res.status(500).json({ message: "خطا در حذف کد تخفیف", error: error.message });
    }
});


const validateWeblog = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("عنوان مقاله الزامی است")
    .isLength({ min: 5, max: 100 })
    .withMessage("عنوان باید بین 5 تا 100 کاراکتر باشد"),
  body("description")
    .trim()
    .notEmpty()
    .withMessage("توضیحات کوتاه الزامی است")
    .isLength({ max: 160 })
    .withMessage("توضیحات کوتاه نمی‌تواند بیشتر از 160 کاراکتر باشد"),
  body("content")
    .trim()
    .notEmpty()
    .withMessage("محتوا الزامی است")
    .isLength({ min: 100 })
    .withMessage("محتوا نمی‌تواند کمتر از 100 کاراکتر باشد"),
  body("readingTime")
    .optional()
    .isInt({ min: 1 })
    .withMessage("زمان مطالعه باید حداقل 1 دقیقه باشد"),
  body("metaTitle")
    .optional()
    .isLength({ max: 60 })
    .withMessage("عنوان متا نمی‌تواند بیشتر از 60 کاراکتر باشد"),
  body("metaDescription")
    .optional()
    .isLength({ max: 160 })
    .withMessage("توضیحات متا نمی‌تواند بیشتر از 160 کاراکتر باشد"),
];

// دریافت لیست مقالات
router.get("/weblogs", async (req, res) => {
  try {
    const weblogs = await Weblog.find({})
      .populate("author", "fullName email")
      .populate("categories", "name")
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      weblogs,
    });
  } catch (error) {
    console.error("Error fetching weblogs:", error);
    res.status(500).json({
      success: false,
      message: "خطا در دریافت مقالات",
      error: error.message,
    });
  }
});

// افزودن مقاله جدید
router.post("/weblogs/add", validateWeblog, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "خطا در اعتبارسنجی",
        errors: errors.array(),
      });
    }

    const {
      title,
      slug,
      description,
      content,
      images,
      categories,
      tags,
      readingTime,
      isFeatured,
      isPublished,
      metaTitle,
      metaDescription,
    } = req.body;

    let formattedImages = [];
    if (images && images.length > 0) {
      formattedImages = images.map(img => {
        // استخراج filename از URL
        const filename = img.split('/').pop();
        return {
          url: img,
          filename: filename
        };
      });
    }

    const weblog = new Weblog({
      title,
      slug,
      description,
      content,
      images: formattedImages,
      categories: categories || [],
      tags: tags || [],
      readingTime: readingTime || 5,
      isFeatured: isFeatured || false,
      isPublished: isPublished || false,
      metaTitle,
      metaDescription,
      author: req.session.userId,
      createTarikh: getPersianDate(),
      updateTarikh: getPersianDate(),
    });

    await weblog.save();

    const populatedWeblog = await Weblog.findById(weblog._id)
      .populate("author", "fullName email")
      .populate("categories", "name");

    res.status(201).json({
      success: true,
      message: "مقاله با موفقیت ایجاد شد",
      weblog: populatedWeblog,
    });
  } catch (error) {
    console.error("Error creating weblog:", error);
    res.status(500).json({
      success: false,
      message: "خطا در ایجاد مقاله",
      error: error.message,
    });
  }
});

// ویرایش مقاله
router.put("/weblogs/edit/:id", validateWeblog, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "خطا در اعتبارسنجی",
        errors: errors.array(),
      });
    }

    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "شناسه مقاله نامعتبر است",
      });
    }

    const {
      title,
      description,
      content,
      images,
      categories,
      tags,
      readingTime,
      isFeatured,
      isPublished,
      metaTitle,
      metaDescription,
    } = req.body;

    let formattedImages = [];
    if (images && images.length > 0) {
      formattedImages = images.map(img => {
        const filename = img.split('/').pop();
        return {
          url: img,
          filename: filename
        };
      });
    }

    const updatedWeblog = await Weblog.findByIdAndUpdate(
      id,
      {
        title,
        description,
        content,
        images: formattedImages,
        categories: categories || [],
        tags: tags || [],
        readingTime: readingTime || 5,
        isFeatured: isFeatured || false,
        isPublished: isPublished || false,
        metaTitle,
        metaDescription,
        updateTarikh: getPersianDate(),
      },
      { new: true, runValidators: true }
    )
      .populate("author", "fullName email")
      .populate("categories", "name");

    if (!updatedWeblog) {
      return res.status(404).json({
        success: false,
        message: "مقاله یافت نشد",
      });
    }

    res.json({
      success: true,
      message: "مقاله با موفقیت ویرایش شد",
      weblog: updatedWeblog,
    });
  } catch (error) {
    console.error("Error updating weblog:", error);
    res.status(500).json({
      success: false,
      message: "خطا در ویرایش مقاله",
      error: error.message,
    });
  }
});

// حذف مقاله
router.delete("/weblogs/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "شناسه مقاله نامعتبر است",
      });
    }

    const deletedWeblog = await Weblog.findByIdAndDelete(id);

    if (!deletedWeblog) {
      return res.status(404).json({
        success: false,
        message: "مقاله یافت نشد",
      });
    }

    res.json({
      success: true,
      message: "مقاله با موفقیت حذف شد",
    });
  } catch (error) {
    console.error("Error deleting weblog:", error);
    res.status(500).json({
      success: false,
      message: "خطا در حذف مقاله",
      error: error.message,
    });
  }
});

// دریافت یک مقاله
router.get("/weblogs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "شناسه مقاله نامعتبر است",
      });
    }

    const weblog = await Weblog.findById(id)
      .populate("author", "fullName email")
      .populate("categories", "name");

    if (!weblog) {
      return res.status(404).json({
        success: false,
        message: "مقاله یافت نشد",
      });
    }

    res.json({
      success: true,
      weblog,
    });
  } catch (error) {
    console.error("Error fetching weblog:", error);
    res.status(500).json({
      success: false,
      message: "خطا در دریافت مقاله",
      error: error.message,
    });
  }
});

router.get("/categories", async (req, res) => {
    try {
        const { type } = req.query;
        const filter = {};
        if (type) {
            filter.categoryType = type;
        }
        const categories = await Category.find(filter);
        res.json({
            success: true,
            categories
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
