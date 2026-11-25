// The demo world: Nestly's illustrated cast as shoppers and sellers, seven
// shops with real-looking listings, reviews, orders and chats. Built fresh
// on first visit and on "Reset demo". Everyone and everything here is made up.

import type { DemoDB, DemoUser, Row } from "./db";

const img = (id: string, w = 900) => `https://images.unsplash.com/photo-${id}?w=${w}&q=80&auto=format&fit=crop`;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString();
const ahead = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

const CATEGORIES: [string, string, number, boolean][] = [
  ["cakes-pastries", "Cakes & Pastries", 8, true],
  ["food", "Food", 8, true],
  ["fashion", "Fashion", 10, false],
  ["women-s-fashion", "Women's Fashion", 12, false],
  ["men-s-fashion", "Men's Fashion", 12, false],
  ["shoes-bags", "Shoes & Bags", 12, false],
  ["electronics", "Electronics", 5, false],
  ["phones-tablets", "Phones & Tablets", 5, false],
  ["phone-gadget-accessories", "Phone & Gadget Accessories", 10, false],
  ["beauty-skincare", "Beauty & Skincare", 12, false],
  ["jewellery-watches", "Jewellery & Watches", 12, false],
  ["home-kitchen", "Home & Kitchen", 10, false],
  ["furniture", "Furniture", 12, false],
  ["gifts-hampers", "Gifts & Hampers", 8, false],
  ["art-handmade-crafts", "Art & Handmade Crafts", 8, false],
  ["baby-kids", "Baby & Kids", 10, false],
  ["health-wellness", "Health & Wellness", 8, false],
  ["sports-fitness", "Sports & Fitness", 10, false],
];

// [key, name, username, dob (MM-DD), bio]
const PEOPLE: [string, string, string, string, string][] = [
  ["tola", "Tola Adebayo", "tolabakes", "03-14", "I bake celebration cakes in Lekki. Orders 48 hours ahead 🎂"],
  ["bisi", "Bisi Okafor", "bisikicks", "07-02", "Fresh sneakers and heels, delivered across Lagos."],
  ["funmi", "Funmi Bello", "funmifabrics", "09-21", "Ankara, aso-oke and ready-to-wear from Surulere."],
  ["emeka", "Emeka Nwosu", "emekagadgets", "01-30", "Original gadgets with warranty. Ikeja Computer Village."],
  ["zainab", "Zainab Musa", "zeebeauty", "05-11", "Skincare that works for melanin. Abuja based."],
  ["segun", "Segun Adeyemi", "segunhome", "11-03", "Furniture and decor made in Ibadan."],
  ["ngozi", "Ngozi Eze", "ngozikitchen", "08-17", "Small chops, party jollof and fruit trays in Festac."],
  ["ada", "Ada Obi", "ada.obi", "12-02", "Product designer. Always hunting for the perfect gift."],
  ["kunle", "Kunle Bakare", "kunleb", "04-25", "Sneakers, gadgets and good food."],
  ["tolu", "Tolu Martins", "tolu.m", "11-21", "Birthday loading… 🎈"],
  ["tobi", "Tobi Ajayi", "tobiaj", "06-08", "Engineer by day, chef by night."],
  ["amaka", "Amaka Udeh", "amakau", "02-19", "Beauty lover and serial gifter."],
  ["yusuf", "Yusuf Bello", "yusuf.nestly", "10-10", "Keeping Nestly safe for buyers and sellers."],
];

const LAGOS_PICKUP = (storeId: string, address: string) => ({ name: "Pickup", fee: 0, eta: "Ready in 2 hours", type: "PICKUP", areas: [], state: null, pickupAddress: address, vehicle: null, storeId });

// [storeKey, owner, name, slug, city, state, address, description, bannerImg, verified]
const STORES: [string, string, string, string, string, string, string, string, string, boolean][] = [
  ["tola", "tola", "Tola's Cakes", "tolas-cakes", "Lekki", "Lagos", "12 Admiralty Way, Lekki Phase 1", "Celebration cakes, cupcakes and dessert boxes, baked fresh to order in Lekki.", "1464349095431-e9a21285b5f3", true],
  ["bisi", "bisi", "Bisi Kicks", "bisi-kicks", "Yaba", "Lagos", "3 Herbert Macaulay Way, Yaba", "Sneakers and heels for every day and every owambe.", "1525966222134-fcfa99b8ae77", true],
  ["funmi", "funmi", "Funmi Fabrics", "funmi-fabrics", "Surulere", "Lagos", "21 Adeniran Ogunsanya St, Surulere", "Ready-to-wear Ankara, aso-oke and tailoring.", "1558618666-fcd25c85cd64", true],
  ["emeka", "emeka", "Emeka Gadgets", "emeka-gadgets", "Ikeja", "Lagos", "Computer Village, Ikeja", "Original phones, audio and smartwatches with 6-month warranty.", "1496181133206-80ce9b88a853", true],
  ["zainab", "zainab", "Zee Beauty", "zee-beauty", "Wuse", "Federal Capital Territory", "Wuse 2, Abuja", "Skincare and jewellery picked for melanin-rich skin.", "1556228578-8c89e6adf883", false],
  ["segun", "segun", "Segun Home", "segun-home", "Bodija", "Oyo", "Bodija, Ibadan", "Handmade furniture and decor from Ibadan.", "1586023492125-27b2c045efd7", true],
  ["ngozi", "ngozi", "Ngozi's Kitchen", "ngozis-kitchen", "Festac", "Lagos", "2nd Avenue, Festac Town", "Small chops, party trays and fresh fruit platters.", "1504674900247-0877df9cc836", false],
];

// [store, category, title, price, originalPrice|null, stock, photo, description, highlights?]
const PRODUCTS: [string, string, string, number, number | null, number, string, string, string[]?][] = [
  ["tola", "cakes-pastries", "Chocolate Drip Celebration Cake", 32000, null, 6, "1578985545062-69928b1d9587", "Three layers of moist chocolate sponge, ganache drip and your message on top. Serves 15.", ["Baked fresh to order", "Message included", "Serves 15"]],
  ["tola", "cakes-pastries", "Strawberry Cream Tier Cake", 45000, 52000, 4, "1535141192574-5d4897c12636", "Two tiers of vanilla sponge with fresh cream and strawberries. Perfect for birthdays.", ["Two tiers", "Fresh strawberries"]],
  ["tola", "cakes-pastries", "Rainbow Sprinkle Party Cake", 28000, null, 8, "1464349095431-e9a21285b5f3", "Six colourful layers and a sprinkle crunch kids love."],
  ["tola", "cakes-pastries", "Strawberry Cupcakes (Box of 6)", 9500, null, 20, "1563729784474-d77dbb933a9e", "Vanilla cupcakes with strawberry buttercream."],
  ["tola", "cakes-pastries", "Red Velvet Cupcakes (Box of 6)", 9000, 10500, 18, "1614707267537-b85aaf00c4b7", "Classic red velvet with cream cheese frosting."],
  ["tola", "cakes-pastries", "Mint Cupcakes (Box of 6)", 8500, null, 12, "1486427944299-d1955d23e34d", "Light mint buttercream on chocolate cupcakes."],
  ["tola", "cakes-pastries", "Strawberry Parfait Cups (4)", 7000, null, 15, "1488477181946-6428a0291777", "Layers of cream, crumble and fresh strawberries."],
  ["bisi", "shoes-bags", "Cloud Runner Sneakers", 38000, 45000, 9, "1600185365483-26d7a4cc7519", "Lightweight runners with a cushioned sole. Sizes 38-45.", ["Sizes 38-45", "Breathable mesh"]],
  ["bisi", "shoes-bags", "Tan Leather Court Sneakers", 42000, null, 6, "1549298916-b41d501d3772", "Soft tan leather low-tops that go with everything."],
  ["bisi", "shoes-bags", "Pastel Low-Top Sneakers", 35000, null, 11, "1595950653106-6c9ebd614d3a", "Pastel colourway low-tops. Sizes 36-42."],
  ["bisi", "shoes-bags", "Burgundy Skate Shoes", 29000, 33000, 7, "1525966222134-fcfa99b8ae77", "Canvas skate shoes with a padded collar."],
  ["bisi", "shoes-bags", "Trail Runner Sneakers", 47000, null, 5, "1560769629-975ec94e6a86", "Grippy trail runners for weekend hikes."],
  ["bisi", "shoes-bags", "Floral Stiletto Heels", 31000, null, 4, "1543163521-1bf539c55dd2", "Statement floral heels for weddings and owambe."],
  ["funmi", "men-s-fashion", "Ankara Print Shirt", 15000, null, 14, "1602810318383-e386cc2a3ccf", "Short-sleeve shirt in a bold Ankara print. Sizes M-XL."],
  ["funmi", "women-s-fashion", "White Off-Shoulder Dress", 26000, 30000, 6, "1515372039744-b8f02a3ae446", "Flowy off-shoulder dress for brunch and beach days."],
  ["funmi", "women-s-fashion", "Linen Summer Tops", 12000, null, 20, "1490481651871-ab68de25d43d", "Breathable linen tops in five colours."],
  ["funmi", "women-s-fashion", "Crochet Poncho Top", 18000, null, 8, "1434389677669-e08b4cac3105", "Handmade crochet poncho, one size."],
  ["funmi", "men-s-fashion", "Classic Denim Jeans", 22000, null, 12, "1542272604-787c3835535d", "Mid-wash straight-leg jeans. Waist 30-38."],
  ["funmi", "fashion", "Leather Biker Jacket", 55000, 62000, 3, "1551028719-00167b16eac5", "Soft faux-leather biker jacket."],
  ["funmi", "men-s-fashion", "Tweed Three-Piece Suit", 95000, null, 4, "1594938298603-c8148c4dae35", "Tailored tweed suit, made to your measurements in 5 days."],
  ["funmi", "shoes-bags", "Woven Orange Handbag", 24000, null, 7, "1590874103328-eac38a683ce7", "Structured woven handbag with leather trim."],
  ["funmi", "shoes-bags", "Red Top-Handle Bag", 34000, null, 5, "1584917865442-de89df76afd3", "Glossy red top-handle bag with a detachable strap."],
  ["emeka", "electronics", "Studio Wireless Headphones", 65000, 75000, 8, "1505740420928-5e560c06d30e", "Over-ear Bluetooth headphones with 30-hour battery.", ["30-hour battery", "6-month warranty"]],
  ["emeka", "jewellery-watches", "Minimal Smartwatch", 48000, null, 10, "1523275335684-37898b6baf30", "Heart rate, sleep and step tracking with a 7-day battery."],
  ["emeka", "phones-tablets", "Smartphone 128GB (UK used)", 285000, 310000, 3, "1511707171634-5f897ff02aa9", "Grade A UK-used smartphone, 128GB, battery health 90%+."],
  ["emeka", "electronics", "Slim Laptop 14\"", 520000, null, 2, "1496181133206-80ce9b88a853", "14-inch laptop, 16GB RAM, 512GB SSD."],
  ["emeka", "electronics", "Noise-Cancelling Headphones", 89000, null, 5, "1546435770-a3e426bf472b", "Active noise cancelling with transparency mode."],
  ["emeka", "phone-gadget-accessories", "Wireless Earbuds", 22000, 26000, 15, "1572569511254-d8f925fe2cbb", "True wireless earbuds with charging case."],
  ["zainab", "beauty-skincare", "Gentle Foaming Cleanser", 9500, null, 25, "1620916566398-39f1143ab7be", "Low-pH cleanser that won't strip your skin."],
  ["zainab", "beauty-skincare", "Glow Skincare Set", 32000, 38000, 9, "1571781926291-c477ebfd024b", "Cleanser, toner, serum and moisturiser in one set.", ["4-step routine", "Gift box"]],
  ["zainab", "beauty-skincare", "Vitamin C Serum", 14000, null, 18, "1608571423902-eed4a5ad8108", "Brightening serum for dark spots and uneven tone."],
  ["zainab", "beauty-skincare", "Botanical Oils Collection", 21000, null, 7, "1612817288484-6f916006741a", "Hair and body oils with shea and baobab."],
  ["zainab", "jewellery-watches", "Pearl Necklace", 27000, null, 6, "1515562141207-7a88fb7ce338", "Freshwater pearl necklace in a gift box."],
  ["zainab", "jewellery-watches", "Gold Pendant Chain", 19000, null, 10, "1599643478518-a784e5dc4c8f", "18k gold-plated pendant chain."],
  ["zainab", "jewellery-watches", "Chunky Gold Rings Set", 15000, null, 12, "1617038260897-41a1f14a8ca0", "Set of three stackable gold-tone rings."],
  ["segun", "furniture", "Mustard Accent Chair", 145000, 160000, 3, "1586023492125-27b2c045efd7", "Upholstered accent chair with solid wood legs."],
  ["segun", "furniture", "Emerald Velvet Sofa", 480000, null, 2, "1555041469-a586c61ea9bc", "Three-seater velvet sofa, made to order in 10 days."],
  ["segun", "home-kitchen", "Teal Pendant Lamp", 38000, null, 6, "1513506003901-1e6a229e2d15", "Metal pendant lamp for dining and kitchens."],
  ["segun", "furniture", "Complete Living Room Set", 1250000, null, 1, "1616486338812-3dadae4b4ace", "Sofa, armchairs, coffee table and rug."],
  ["segun", "home-kitchen", "Grey Lounge Sofa + Cushions", 390000, 420000, 2, "1493663284031-b7e3aefcae8e", "Deep-seat lounge sofa with four cushions."],
  ["ngozi", "food", "Party Small Chops Tray (50 pcs)", 25000, null, 10, "1504674900247-0877df9cc836", "Puff-puff, samosa, spring rolls, gizdodo and chicken.", ["50 pieces", "Order a day ahead"]],
  ["ngozi", "food", "Fresh Fruit Platter", 18000, null, 8, "1610832958506-aa56368176cf", "Seasonal fruit, cut and arranged for 10 people."],
  ["ngozi", "food", "Healthy Salad Bowls (4)", 16000, null, 12, "1546069901-ba9599a7e63c", "Four big salad bowls with grilled chicken."],
  ["ngozi", "food", "Rainbow Veggie Bowls (4)", 15000, null, 12, "1512621776951-a57141f2eefd", "Grains, roasted veg and avocado."],
  ["ngozi", "food", "Party Pizza Trays (2)", 22000, null, 6, "1565299624946-b28f40a0ae38", "Two large pizzas cut for parties."],
];

export const buildSeed = (): DemoDB => {
  const categories: Row[] = CATEGORIES.map(([slug, name, commissionRate, isPerishable], i) => ({
    id: `cat_${slug}`,
    name,
    slug,
    icon: null,
    isFeatured: i < 12,
    commissionRate,
    isPerishable,
    createdAt: ago(60),
  }));
  const cat = (slug: string) => categories.find((c) => c.slug === slug)!;

  const users: DemoUser[] = PEOPLE.map(([key, name, username, dob, bio], i) => ({
    id: `u_${key}`,
    name,
    email: `${key}@demo.nestly`,
    username,
    avatar: `/demo/people/${key}.svg`,
    cover: null,
    bio,
    location: null,
    website: null,
    socialLinks: null,
    occupation: null,
    company: null,
    education: null,
    dateOfBirth: `1996-${dob}T00:00:00.000Z`,
    skills: [],
    interests: [],
    languages: [],
    role: key === "yusuf" ? "ADMIN" : "USER",
    isVerified: true,
    twoFactorEnabled: false,
    isGuest: false,
    status: "ACTIVE",
    createdAt: ago(90 - i * 3),
    wishlistVisibility: "FOLLOWERS",
  }));

  const sellers: Row[] = [];
  const stores: Row[] = [];
  const shippingOptions: Row[] = [];
  STORES.forEach(([key, owner, name, slug, city, state, address, description, banner, verified], i) => {
    const sellerId = `sp_${key}`;
    const storeId = `st_${key}`;
    sellers.push({
      id: sellerId,
      userId: `u_${owner}`,
      status: "APPROVED",
      statusReason: null,
      // Ngozi opened with quick start a few hours ago and is waiting for review.
      statusUpdatedAt: key === "ngozi" ? ago(0, 5) : ago(70 - i),
      cacNumber: verified ? `RC${1200000 + i * 7311}` : null,
      cacCompanyType: verified ? "BUSINESS_NAME" : null,
      isVerified: verified,
      businessName: name,
      createdAt: key === "ngozi" ? ago(0, 5) : ago(75 - i),
    });
    stores.push({
      id: storeId,
      sellerId,
      name,
      slug,
      description,
      logo: `/demo/people/${owner}.svg`,
      banner: img(banner, 1600),
      email: `${key}@demo.nestly`,
      phone: "0803 000 0000",
      address,
      city,
      state,
      country: "Nigeria",
      rating: 4.6 + (i % 4) / 10,
      totalSales: 40 + i * 23,
      isVerified: verified,
      isSuspended: false,
      underReview: key === "ngozi",
      reviewRemindersSent: 0,
      salesStoppedAt: null,
      shippingPolicy: "We deliver within 24-48 hours. Pickup is free.",
      warrantyPolicy: key === "emeka" ? "6-month warranty on all gadgets." : null,
      referralCode: key.toUpperCase().slice(0, 4) + "2026",
      // A made-up payout account (Ngozi, the new store, hasn't added one yet).
      paystackSubaccountCode: key === "ngozi" ? null : `ACCT_demo${key}`,
      payoutBankName: key === "ngozi" ? null : "GTBank",
      payoutAccountNumber: key === "ngozi" ? null : `01234${String(48210 + i).slice(-5)}`,
      payoutAccountName: key === "ngozi" ? null : name.toUpperCase(),
      payoutAccountUpdatedAt: null,
      instagram: owner === "tola" ? "tolabakes" : null,
      // Tola's shop shows off brand colours (her pink, shaded where needed).
      brandColor: key === "tola" ? "#db2777" : null,
      whatsapp: "08030000000",
      createdAt: key === "ngozi" ? ago(0, 5) : ago(70 - i),
    });
    const lagos = state === "Lagos";
    shippingOptions.push({ id: `so_${key}_pickup`, ...LAGOS_PICKUP(storeId, address), isArchived: false, createdAt: ago(60), updatedAt: ago(60) });
    shippingOptions.push({
      id: `so_${key}_city`,
      storeId,
      name: lagos ? "Same-day Lagos" : `Same-day ${city}`,
      fee: lagos ? 2500 : 2000,
      eta: "Same day",
      type: "DELIVERY",
      areas: [],
      state,
      pickupAddress: null,
      vehicle: key === "segun" ? "VAN" : null,
      isArchived: false,
      createdAt: ago(60),
      updatedAt: ago(60),
    });
    if (lagos) {
      shippingOptions.push({
        id: `so_${key}_island`,
        storeId,
        name: "Lekki / Victoria Island / Ikoyi",
        fee: 3500,
        eta: "Next day",
        type: "DELIVERY",
        areas: ["Lekki", "Victoria Island", "Ikoyi", "Ajah"],
        state: "Lagos",
        pickupAddress: null,
        vehicle: null,
        isArchived: false,
        createdAt: ago(60),
        updatedAt: ago(60),
      });
      shippingOptions.push({
        id: `so_${key}_mainland`,
        storeId,
        name: "Festac / Surulere / Yaba / Ikeja",
        fee: 3000,
        eta: "Next day",
        type: "DELIVERY",
        areas: ["Festac", "Surulere", "Yaba", "Ikeja", "Amuwo Odofin"],
        state: "Lagos",
        pickupAddress: null,
        vehicle: null,
        isArchived: false,
        createdAt: ago(60),
        updatedAt: ago(60),
      });
    }
  });

  const products: Row[] = PRODUCTS.map(([store, category, title, price, originalPrice, stock, photo, description, highlights], i) => {
    const id = `p_${String(i + 1).padStart(3, "0")}`;
    return {
      id,
      storeId: `st_${store}`,
      categoryId: cat(category).id,
      title,
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      description,
      sku: `${store.toUpperCase().slice(0, 3)}-${String(i + 1).padStart(3, "0")}`,
      brand: null,
      condition: "NEW",
      deliveryVehicle: store === "segun" ? "VAN" : "BIKE",
      status: "PUBLISHED",
      isFeatured: i % 6 === 0,
      highlights: highlights ?? [],
      price,
      originalPrice,
      stock,
      reviewsResetAt: null,
      createdAt: ago(40 - (i % 30), i % 24),
      updatedAt: ago(3),
      images: [{ id: `${id}_img`, productId: id, url: img(photo), isPrimary: true }],
      specifications: [],
      options: [],
      variations: [],
      views: 40 + ((i * 37) % 300),
      sold: 3 + ((i * 13) % 40),
    };
  });

  const REVIEWERS = ["u_ada", "u_kunle", "u_tolu", "u_tobi", "u_amaka"];
  const LINES = [
    "Exactly like the pictures. Delivery was quick and the seller kept me updated.",
    "Paid on Nestly, got my delivery code, everything smooth. Will buy again!",
    "Great quality for the price. Packaging was neat too.",
    "My friends couldn't stop asking where I got it 😍",
    "Arrived the same day. Very professional seller.",
  ];
  const reviews: Row[] = [];
  products.forEach((product, i) => {
    const count = i % 3 === 0 ? 3 : i % 3 === 1 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      reviews.push({
        id: `r_${product.id}_${k}`,
        productId: product.id,
        userId: REVIEWERS[(i + k) % REVIEWERS.length],
        rating: k === 2 ? 4 : 5,
        comment: LINES[(i + k) % LINES.length],
        images: k === 0 && i % 4 === 0 ? [product.images[0].url] : [],
        createdAt: ago(2 + ((i * 3 + k * 5) % 20), k),
        updatedAt: ago(2),
      });
    }
  });

  const follows: Row[] = [
    ...["tola", "bisi", "zainab", "funmi"].map((s) => ({ followerId: "u_ada", storeId: `st_${s}`, createdAt: ago(20) })),
    ...["tolu", "kunle", "amaka", "tola"].map((u) => ({ followerId: "u_ada", userId: `u_${u}`, createdAt: ago(25) })),
    ...["ada", "tolu", "amaka", "kunle"].map((u) => ({ followerId: `u_${u}`, userId: "u_ada", createdAt: ago(25) })),
    ...["ada", "kunle", "tolu", "tobi", "amaka"].map((u) => ({ followerId: `u_${u}`, storeId: "st_tola", createdAt: ago(30) })),
  ];

  const addresses: Row[] = [
    { id: "addr_ada", userId: "u_ada", fullName: "Ada Obi", phone: "08031112222", address: "5 Admiralty Way", city: "Lekki", state: "Lagos", country: "Nigeria", postalCode: null, latitude: 6.4474, longitude: 3.4723, isDefault: true, createdAt: ago(50) },
    { id: "addr_ada_work", userId: "u_ada", fullName: "Ada Obi", phone: "08031112222", address: "14 Bourdillon Road (office)", city: "Ikoyi", state: "Lagos", country: "Nigeria", postalCode: null, latitude: 6.4541, longitude: 3.4316, isDefault: false, createdAt: ago(40) },
    { id: "addr_tolu", userId: "u_tolu", fullName: "Tolu Martins", phone: "08035556666", address: "9 Bode Thomas St", city: "Surulere", state: "Lagos", country: "Nigeria", postalCode: null, latitude: 6.495, longitude: 3.356, isDefault: true, createdAt: ago(50) },
    { id: "addr_kunle", userId: "u_kunle", fullName: "Kunle Bakare", phone: "08037778888", address: "22 Allen Avenue", city: "Ikeja", state: "Lagos", country: "Nigeria", postalCode: null, latitude: 6.6, longitude: 3.35, isDefault: true, createdAt: ago(50) },
  ];

  return {
    version: 2,
    users,
    sellers,
    stores,
    shippingOptions,
    categories,
    products,
    reviews,
    follows,
    addresses,
    carts: [],
    orders: [],
    notifications: [],
    conversations: [],
    messages: [],
    wishlist: [
      { userId: "u_ada", productId: "p_030", createdAt: ago(5) },
      { userId: "u_ada", productId: "p_023", createdAt: ago(4) },
      { userId: "u_tolu", productId: "p_008", createdAt: ago(6) },
      { userId: "u_tolu", productId: "p_023", createdAt: ago(6) },
    ],
    gifts: [],
    groupGifts: [],
    paymentLinks: [],
    offers: [],
    lives: [],
    posts: [],
    feedAreas: [],
    payouts: [],
    payments: [],
    collections: [
      {
        id: "col_tola_weekend",
        storeId: "st_tola",
        name: "Weekend treats",
        slug: "weekend-treats",
        description: "Cupcakes and parfaits for the weekend - order by Friday.",
        isActive: true,
        productIds: ["p_004", "p_005", "p_007"],
        createdAt: ago(3),
        updatedAt: ago(3),
      },
    ],
  };
};

export { ahead };
