// The generator copies only approved bytes into this registry and keys them by digest.
const artwork=import.meta.glob('./public-entry-index/artwork/*.png',{
  query:'?url',import:'default',eager:true
});

export function publicArtworkUrl(asset){
  return asset?artwork['./public-entry-index/artwork/'+asset]??null:null;
}
