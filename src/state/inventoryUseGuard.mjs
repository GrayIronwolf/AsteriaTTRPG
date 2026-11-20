/** Reject attempts to activate depleted or unidentified inventory items.
 * Server-side validation is required regardless of disabled UI buttons.
 */
export function assertConsumableInventoryItem(item){
  if(!item||typeof item!=='object'||Array.isArray(item))
    throw Error('Inventory item not found.');
  const quantity=Number(item.qty??item.quantity??0);
  if(!Number.isSafeInteger(quantity)||quantity<1)
    throw Error('This item has no remaining charges or quantity.');
  if(item.identified===false)
    throw Error('Identify this item before using it.');
  return quantity;
}
