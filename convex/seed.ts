import { mutation } from "./_generated/server.js";
import { requireOwner } from "./authHelpers.js";

// Run this mutation once to seed demo data.
// In management dashboard, just call this from console or a one-time button.
export const seedDatabase = mutation({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);

    // Check if already seeded
    const existingTables = await ctx.db.query("restaurant_tables").first();
    if (existingTables) {
      return { message: "Database already seeded" };
    }

    // Create tables 1-10
    const tableTokens: string[] = [];
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const genToken = () =>
      Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

    for (let i = 1; i <= 10; i++) {
      const token = genToken();
      tableTokens.push(token);
      await ctx.db.insert("restaurant_tables", {
        tableNumber: i,
        name: `Table ${i}`,
        token,
        status: "available",
        isActive: true,
        capacity: i <= 4 ? 4 : i <= 7 ? 6 : 8,
      });
    }

    // Categories
    const categoryNames = [
      { name: "Starters", sortOrder: 1 },
      { name: "Main Course", sortOrder: 2 },
      { name: "Breads", sortOrder: 3 },
      { name: "Drinks", sortOrder: 4 },
      { name: "Desserts", sortOrder: 5 },
    ];

    const categoryIds: Record<string, string> = {};
    for (const cat of categoryNames) {
      const id = await ctx.db.insert("categories", { ...cat, isActive: true });
      categoryIds[cat.name] = id;
    }

    // Menu items
    const menuItems = [
      // Starters
      {
        name: "Paneer Tikka",
        description: "Marinated cottage cheese grilled in tandoor",
        categoryId: categoryIds["Starters"],
        price: 28000, // ₹280 in paise
        isVeg: true,
        isAvailable: true,
        imageUrl: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=400&h=300&fit=crop",
        ingredients: "Paneer, yogurt, bell peppers, spices",
        sortOrder: 1,
        addons: [
          { name: "Extra Paneer", price: 8000 },
          { name: "Mint Chutney", price: 2000 },
        ],
      },
      {
        name: "Chicken Tikka",
        description: "Tender chicken marinated with spices and grilled",
        categoryId: categoryIds["Starters"],
        price: 35000, // ₹350
        isVeg: false,
        isAvailable: true,
        imageUrl: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&h=300&fit=crop",
        ingredients: "Chicken, yogurt, spices, lemon",
        sortOrder: 2,
        addons: [
          { name: "Extra Chicken", price: 10000 },
          { name: "Mint Chutney", price: 2000 },
        ],
      },
      {
        name: "Veg Spring Rolls",
        description: "Crispy rolls stuffed with vegetables",
        categoryId: categoryIds["Starters"],
        price: 18000, // ₹180
        isVeg: true,
        isAvailable: true,
        imageUrl: "https://images.unsplash.com/photo-1548693085-83534c61413b?w=400&h=300&fit=crop",
        sortOrder: 3,
        addons: [
          { name: "Extra Sauce", price: 1500 },
        ],
      },
      // Main Course
      {
        name: "Chicken Biryani",
        description: "Fragrant basmati rice cooked with spiced chicken",
        categoryId: categoryIds["Main Course"],
        price: 32000, // ₹320
        isVeg: false,
        isAvailable: true,
        imageUrl: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&h=300&fit=crop",
        ingredients: "Chicken, basmati rice, saffron, whole spices",
        sortOrder: 1,
        addons: [
          { name: "Extra Chicken", price: 8000 },
          { name: "Extra Egg", price: 2000 },
          { name: "Extra Rice", price: 3000 },
          { name: "Raita", price: 3000 },
        ],
      },
      {
        name: "Paneer Butter Masala",
        description: "Rich tomato-based curry with cottage cheese",
        categoryId: categoryIds["Main Course"],
        price: 26000, // ₹260
        isVeg: true,
        isAvailable: true,
        imageUrl: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=300&fit=crop",
        ingredients: "Paneer, tomatoes, butter, cream",
        sortOrder: 2,
        addons: [
          { name: "Extra Paneer", price: 8000 },
          { name: "Extra Gravy", price: 3000 },
        ],
      },
      {
        name: "Dal Makhani",
        description: "Slow cooked black lentils with cream and butter",
        categoryId: categoryIds["Main Course"],
        price: 22000, // ₹220
        isVeg: true,
        isAvailable: true,
        sortOrder: 3,
        addons: [
          { name: "Extra Butter", price: 2000 },
        ],
      },
      {
        name: "Chicken Curry",
        description: "Classic home-style chicken curry",
        categoryId: categoryIds["Main Course"],
        price: 30000, // ₹300
        isVeg: false,
        isAvailable: true,
        sortOrder: 4,
        addons: [
          { name: "Extra Chicken", price: 8000 },
          { name: "Extra Gravy", price: 3000 },
        ],
      },
      // Breads
      {
        name: "Butter Naan",
        description: "Leavened bread baked in tandoor with butter",
        categoryId: categoryIds["Breads"],
        price: 5000, // ₹50
        isVeg: true,
        isAvailable: true,
        imageUrl: "https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=400&h=300&fit=crop",
        sortOrder: 1,
        addons: [
          { name: "Extra Butter", price: 1500 },
          { name: "Garlic Topping", price: 1500 },
        ],
      },
      {
        name: "Garlic Naan",
        description: "Naan bread topped with garlic and coriander",
        categoryId: categoryIds["Breads"],
        price: 6000, // ₹60
        isVeg: true,
        isAvailable: true,
        sortOrder: 2,
        addons: [
          { name: "Extra Butter", price: 1500 },
        ],
      },
      {
        name: "Tandoori Roti",
        description: "Whole wheat bread from tandoor",
        categoryId: categoryIds["Breads"],
        price: 3500, // ₹35
        isVeg: true,
        isAvailable: true,
        sortOrder: 3,
        addons: [],
      },
      // Drinks
      {
        name: "Coke",
        description: "Chilled Coca-Cola 300ml",
        categoryId: categoryIds["Drinks"],
        price: 6000, // ₹60
        isVeg: true,
        isAvailable: true,
        sortOrder: 1,
        addons: [],
      },
      {
        name: "Fresh Lime Soda",
        description: "Fresh squeezed lime with soda",
        categoryId: categoryIds["Drinks"],
        price: 8000, // ₹80
        isVeg: true,
        isAvailable: true,
        sortOrder: 2,
        addons: [
          { name: "Sweet", price: 0 },
          { name: "Salted", price: 0 },
        ],
      },
      {
        name: "Mango Lassi",
        description: "Thick mango-flavored yogurt drink",
        categoryId: categoryIds["Drinks"],
        price: 10000, // ₹100
        isVeg: true,
        isAvailable: true,
        sortOrder: 3,
        addons: [],
      },
      {
        name: "Water",
        description: "Packaged mineral water 1L",
        categoryId: categoryIds["Drinks"],
        price: 3500, // ₹35
        isVeg: true,
        isAvailable: true,
        sortOrder: 4,
        addons: [],
      },
      // Desserts
      {
        name: "Gulab Jamun",
        description: "Soft dumplings in sugar syrup",
        categoryId: categoryIds["Desserts"],
        price: 12000, // ₹120
        isVeg: true,
        isAvailable: true,
        imageUrl: "https://images.unsplash.com/photo-1601050690117-94f5f7a59d82?w=400&h=300&fit=crop",
        sortOrder: 1,
        addons: [
          { name: "Extra Syrup", price: 1500 },
          { name: "With Ice Cream", price: 5000 },
        ],
      },
      {
        name: "Vanilla Ice Cream",
        description: "Creamy vanilla ice cream 2 scoops",
        categoryId: categoryIds["Desserts"],
        price: 10000, // ₹100
        isVeg: true,
        isAvailable: true,
        sortOrder: 2,
        addons: [
          { name: "Chocolate Sauce", price: 2000 },
          { name: "Sprinkles", price: 1000 },
        ],
      },
    ];

    for (const item of menuItems) {
      const { addons, ...menuItemData } = item;
      const menuItemId = await ctx.db.insert("menu_items", {
        ...menuItemData,
        categoryId: menuItemData.categoryId as Parameters<typeof ctx.db.insert<"menu_items">>[1]["categoryId"],
      });
      for (const addon of addons) {
        await ctx.db.insert("menu_addons", {
          menuItemId,
          name: addon.name,
          price: addon.price,
          isAvailable: true,
        });
      }
    }

    return {
      message: "Database seeded successfully",
      tables: 10,
      categories: categoryNames.length,
      menuItems: menuItems.length,
    };
  },
});
