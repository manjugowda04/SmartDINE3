import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { formatINR } from "@/lib/restaurant.ts";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { Plus, Pencil, Leaf, Drumstick, ToggleLeft, ToggleRight, ChevronDown, ChevronRight } from "lucide-react";

export default function MenuPage() {
  const categories = useQuery(api.menu.listCategories, {});
  const menuItems = useQuery(api.menu.listMenuItems, { includeUnavailable: true });
  const createCategory = useMutation(api.menu.createCategory);
  const createMenuItem = useMutation(api.menu.createMenuItem);
  const updateMenuItem = useMutation(api.menu.updateMenuItem);
  const createAddon = useMutation(api.menu.createAddon);
  const updateAddon = useMutation(api.menu.updateAddon);

  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);
  const [editItem, setEditItem] = useState<Id<"menu_items"> | null>(null);
  const [showAddonFor, setShowAddonFor] = useState<Id<"menu_items"> | null>(null);

  const [itemForm, setItemForm] = useState({
    name: "", description: "", categoryId: "" as Id<"categories"> | "",
    price: "", isVeg: true, isAvailable: true, imageUrl: "", ingredients: ""
  });
  const [catForm, setCatForm] = useState({ name: "", sortOrder: "99" });
  const [addonForm, setAddonForm] = useState({ name: "", price: "" });

  const toggleCat = (id: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const itemsByCategory: Record<string, typeof menuItems> = {};
  menuItems?.forEach((item) => {
    const key = item.categoryId;
    if (!itemsByCategory[key]) itemsByCategory[key] = [];
    itemsByCategory[key].push(item);
  });

  const handleCreateItem = async () => {
    if (!itemForm.name || !itemForm.categoryId || !itemForm.price) {
      toast.error("Name, category, and price are required");
      return;
    }
    try {
      const priceInPaise = Math.round(Number(itemForm.price) * 100);
      if (editItem) {
        await updateMenuItem({
          menuItemId: editItem,
          name: itemForm.name,
          description: itemForm.description || undefined,
          categoryId: itemForm.categoryId as Id<"categories">,
          price: priceInPaise,
          isVeg: itemForm.isVeg,
          isAvailable: itemForm.isAvailable,
          imageUrl: itemForm.imageUrl || undefined,
          ingredients: itemForm.ingredients || undefined,
        });
        toast.success("Menu item updated!");
      } else {
        await createMenuItem({
          name: itemForm.name,
          description: itemForm.description || undefined,
          categoryId: itemForm.categoryId as Id<"categories">,
          price: priceInPaise,
          isVeg: itemForm.isVeg,
          isAvailable: itemForm.isAvailable,
          imageUrl: itemForm.imageUrl || undefined,
          ingredients: itemForm.ingredients || undefined,
        });
        toast.success("Menu item created!");
      }
      setShowAddItem(false);
      setEditItem(null);
    } catch (e) {
      if (e instanceof ConvexError) toast.error(e.data.message);
      else toast.error("Failed to save menu item");
    }
  };

  const handleAddAddon = async () => {
    if (!showAddonFor || !addonForm.name || !addonForm.price) {
      toast.error("Name and price are required");
      return;
    }
    try {
      await createAddon({
        menuItemId: showAddonFor,
        name: addonForm.name,
        price: Math.round(Number(addonForm.price) * 100),
      });
      toast.success("Add-on created!");
      setAddonForm({ name: "", price: "" });
    } catch (e) {
      toast.error("Failed to create add-on");
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Menu</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowAddCat(true)} className="gap-1">
            <Plus className="size-4" /> Category
          </Button>
          <Button size="sm" onClick={() => { setEditItem(null); setItemForm({ name: "", description: "", categoryId: "", price: "", isVeg: true, isAvailable: true, imageUrl: "", ingredients: "" }); setShowAddItem(true); }} className="gap-1">
            <Plus className="size-4" /> Item
          </Button>
        </div>
      </div>

      {categories === undefined ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => {
            const items = itemsByCategory[cat._id] ?? [];
            const isExpanded = expandedCats.has(cat._id);
            return (
              <div key={cat._id} className="bg-card border rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleCat(cat._id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    <span className="font-semibold">{cat.name}</span>
                    <span className="text-xs text-muted-foreground">({items.length} items)</span>
                  </div>
                  {!cat.isActive && (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">Inactive</span>
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t divide-y">
                    {items.map((item) => (
                      <div key={item._id} className={`px-4 py-3 flex items-center gap-3 ${!item.isAvailable ? "opacity-50" : ""}`}>
                        {item.imageUrl && (
                          <img src={item.imageUrl} alt={item.name} className="size-12 rounded-lg object-cover flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {item.isVeg ? <Leaf className="size-3 text-green-600" /> : <Drumstick className="size-3 text-red-500" />}
                            <span className="font-medium text-sm">{item.name}</span>
                          </div>
                          {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
                          <p className="text-sm font-semibold mt-0.5">{formatINR(item.price)}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => updateMenuItem({ menuItemId: item._id, isAvailable: !item.isAvailable })}
                          >
                            {item.isAvailable ? <ToggleRight className="size-4 text-green-600" /> : <ToggleLeft className="size-4 text-muted-foreground" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => {
                              setEditItem(item._id);
                              setItemForm({
                                name: item.name,
                                description: item.description ?? "",
                                categoryId: item.categoryId,
                                price: String(item.price / 100),
                                isVeg: item.isVeg,
                                isAvailable: item.isAvailable,
                                imageUrl: item.imageUrl ?? "",
                                ingredients: item.ingredients ?? "",
                              });
                              setShowAddItem(true);
                            }}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 px-2 text-xs"
                            onClick={() => setShowAddonFor(item._id)}
                          >
                            Add-ons
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Item Dialog */}
      <Dialog open={showAddItem} onOpenChange={(open) => { if (!open) { setShowAddItem(false); setEditItem(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Menu Item" : "Add Menu Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Item name *" value={itemForm.name} onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))} />
            <Textarea placeholder="Description" value={itemForm.description} onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
            <select
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              value={itemForm.categoryId}
              onChange={(e) => setItemForm((f) => ({ ...f, categoryId: e.target.value as Id<"categories"> }))}
            >
              <option value="">Select Category *</option>
              {categories?.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <Input placeholder="Price in ₹ (e.g. 280)" type="number" value={itemForm.price} onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))} />
            <Input placeholder="Image URL (optional)" value={itemForm.imageUrl} onChange={(e) => setItemForm((f) => ({ ...f, imageUrl: e.target.value }))} />
            <Input placeholder="Ingredients info (optional)" value={itemForm.ingredients} onChange={(e) => setItemForm((f) => ({ ...f, ingredients: e.target.value }))} />
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={itemForm.isVeg} onChange={(e) => setItemForm((f) => ({ ...f, isVeg: e.target.checked }))} />
                Vegetarian
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={itemForm.isAvailable} onChange={(e) => setItemForm((f) => ({ ...f, isAvailable: e.target.checked }))} />
                Available
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => { setShowAddItem(false); setEditItem(null); }}>Cancel</Button>
            <Button onClick={handleCreateItem}>{editItem ? "Save Changes" : "Create Item"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Category Dialog */}
      <Dialog open={showAddCat} onOpenChange={setShowAddCat}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Category</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Category name" value={catForm.name} onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))} />
            <Input placeholder="Sort order" type="number" value={catForm.sortOrder} onChange={(e) => setCatForm((f) => ({ ...f, sortOrder: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAddCat(false)}>Cancel</Button>
            <Button onClick={async () => {
              if (!catForm.name) return;
              try {
                await createCategory({ name: catForm.name, sortOrder: Number(catForm.sortOrder) });
                toast.success("Category created!");
                setShowAddCat(false);
                setCatForm({ name: "", sortOrder: "99" });
              } catch (e) { toast.error("Failed to create category"); }
            }}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Addon Dialog */}
      <Dialog open={!!showAddonFor} onOpenChange={(open) => !open && setShowAddonFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Manage Add-ons</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Add-on name" value={addonForm.name} onChange={(e) => setAddonForm((f) => ({ ...f, name: e.target.value }))} />
              <Input placeholder="Price ₹" type="number" value={addonForm.price} onChange={(e) => setAddonForm((f) => ({ ...f, price: e.target.value }))} className="w-28" />
              <Button onClick={handleAddAddon} size="sm">Add</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAddonFor(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
