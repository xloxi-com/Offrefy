/**
 * Fill remaining settings toast/hint strings + leftover offerEditor labels.
 * Usage: node scripts/fix-admin-locale-gaps-2.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminDir = path.join(root, "app", "locales", "admin");

const packs = {
  de: {
    "settings.neverSynced": "Noch nie synchronisiert",
    "settings.unknownTime": "Unbekannt",
    "settings.toast.sheetsCreated":
      "Übersetzungsblätter für alle Shopify-Shop-Sprachen erstellt",
    "settings.toast.upgradeTranslations":
      "Storefront-Übersetzungen sind in Standard und Premium verfügbar. Upgraden zum Freischalten.",
    "settings.toast.englishSource": "Englisch ist die Quellsprache",
    "settings.toast.settingsSaved": "Einstellungen gespeichert",
    "settings.toast.syncComplete": "Shopify-Sync abgeschlossen",
    "settings.toast.autoTranslateComplete": "Auto-Übersetzung abgeschlossen",
    "settings.localeScopeHint":
      " Aktualisieren Sie diese Seite danach, sobald Sie die Berechtigungen genehmigt haben.",
    "settings.refreshLanguagesHint":
      " Nutzen Sie die Aktualisieren-Schaltfläche, wenn kürzlich Sprachen in Shopify hinzugefügt wurden.",
    "settings.help.buyPrefix":
      "Wird für Stufenbeschriftungen wie „Buy 10“ → „Achetez 10“ verwendet.",
    "settings.help.cartDiscount":
      "Wird in Warenkorb/Checkout angezeigt, z. B. 6% OFF. Verwenden Sie {{ discount }} und {{ amount }}.",
    "settings.help.cartDiscountQty":
      "Gruppierte Mengenbeschriftung, z. B. „(qty 20)“ → „(qté 20)“.",
  },
  fr: {
    "settings.neverSynced": "Jamais synchronisé",
    "settings.unknownTime": "Inconnu",
    "settings.toast.sheetsCreated":
      "Feuilles de traduction créées pour toutes les langues de la boutique Shopify",
    "settings.toast.upgradeTranslations":
      "Les traductions vitrine sont disponibles sur Standard et Premium. Passez à un forfait supérieur pour les débloquer.",
    "settings.toast.englishSource": "L’anglais est la langue source",
    "settings.toast.settingsSaved": "Paramètres enregistrés",
    "settings.toast.syncComplete": "Synchronisation Shopify terminée",
    "settings.toast.autoTranslateComplete": "Traduction automatique terminée",
    "settings.localeScopeHint":
      " Puis actualisez cette page après avoir approuvé les autorisations.",
    "settings.refreshLanguagesHint":
      " Utilisez le bouton d’actualisation si des langues ont été ajoutées récemment dans Shopify.",
    "settings.help.buyPrefix":
      "Utilisé pour les libellés de paliers comme « Buy 10 » → « Achetez 10 ».",
    "settings.help.cartDiscount":
      "Affiché dans le panier/paiement, ex. 6% OFF. Utilisez {{ discount }} et {{ amount }}.",
    "settings.help.cartDiscountQty":
      "Libellé de quantité groupée, ex. « (qty 20) » → « (qté 20) ».",
    "offerEditor.discountedProducts": "Produits remisés",
    "offerEditor.schedule": "Planification",
    "offerEditor.targetCustomer": "Client cible",
    "offerEditor.cartCheckout": "Panier & paiement",
    "offerEditor.buttonSettings": "Paramètres du bouton",
    "offerEditor.advancedSettings": "Paramètres avancés",
    "offerEditor.themeSetup": "Configuration du thème",
    "pricing.compare.importExport": "Import & export (CSV / Excel)",
    "pricing.feature.importExport": "Import & export (CSV / Excel)",
  },
  es: {
    "settings.neverSynced": "Nunca sincronizado",
    "settings.unknownTime": "Desconocido",
    "settings.toast.sheetsCreated":
      "Hojas de traducción creadas para todos los idiomas de la tienda Shopify",
    "settings.toast.upgradeTranslations":
      "Las traducciones de la tienda están disponibles en Standard y Premium. Mejora el plan para desbloquearlas.",
    "settings.toast.englishSource": "El inglés es el idioma de origen",
    "settings.toast.settingsSaved": "Ajustes guardados",
    "settings.toast.syncComplete": "Sincronización de Shopify completada",
    "settings.toast.autoTranslateComplete": "Traducción automática completada",
    "settings.localeScopeHint":
      " Luego actualiza esta página tras aprobar los permisos.",
    "settings.refreshLanguagesHint":
      " Usa el botón de actualizar si se añadieron idiomas en Shopify recientemente.",
    "settings.help.buyPrefix":
      "Se usa en etiquetas de nivel como «Buy 10» → «Achetez 10».",
    "settings.help.cartDiscount":
      "Se muestra en el carrito/pago, p. ej. 6% OFF. Usa {{ discount }} y {{ amount }}.",
    "settings.help.cartDiscountQty":
      "Etiqueta de cantidad agrupada, p. ej. «(qty 20)» → «(qté 20)».",
    "offerEditor.discountedProducts": "Productos con descuento",
    "offerEditor.schedule": "Programación",
    "offerEditor.targetCustomer": "Cliente objetivo",
    "offerEditor.cartCheckout": "Carrito y pago",
    "offerEditor.buttonSettings": "Ajustes del botón",
    "offerEditor.advancedSettings": "Ajustes avanzados",
    "offerEditor.themeSetup": "Configuración del tema",
  },
  it: {
    "settings.neverSynced": "Mai sincronizzato",
    "settings.unknownTime": "Sconosciuto",
    "settings.toast.sheetsCreated":
      "Fogli di traduzione creati per tutte le lingue del negozio Shopify",
    "settings.toast.upgradeTranslations":
      "Le traduzioni dello storefront sono disponibili su Standard e Premium. Aggiorna per sbloccarle.",
    "settings.toast.englishSource": "L’inglese è la lingua di origine",
    "settings.toast.settingsSaved": "Impostazioni salvate",
    "settings.toast.syncComplete": "Sincronizzazione Shopify completata",
    "settings.toast.autoTranslateComplete": "Traduzione automatica completata",
    "settings.localeScopeHint":
      " Poi aggiorna questa pagina dopo aver approvato i permessi.",
    "settings.refreshLanguagesHint":
      " Usa il pulsante di aggiornamento se di recente sono state aggiunte lingue in Shopify.",
    "settings.help.buyPrefix":
      "Usato per etichette di livello come «Buy 10» → «Achetez 10».",
    "settings.help.cartDiscount":
      "Mostrato in carrello/checkout, es. 6% OFF. Usa {{ discount }} e {{ amount }}.",
    "settings.help.cartDiscountQty":
      "Etichetta quantità raggruppata, es. «(qty 20)» → «(qté 20)».",
    "offerEditor.discountedProducts": "Prodotti scontati",
    "offerEditor.schedule": "Programmazione",
    "offerEditor.targetCustomer": "Cliente target",
    "offerEditor.cartCheckout": "Carrello e checkout",
    "offerEditor.buttonSettings": "Impostazioni pulsante",
    "offerEditor.advancedSettings": "Impostazioni avanzate",
    "offerEditor.themeSetup": "Configurazione tema",
  },
  nl: {
    "settings.neverSynced": "Nog nooit gesynchroniseerd",
    "settings.unknownTime": "Onbekend",
    "settings.toast.sheetsCreated":
      "Vertalingsbladen aangemaakt voor alle Shopify-winkeltalen",
    "settings.toast.upgradeTranslations":
      "Storefront-vertalingen zijn beschikbaar op Standard en Premium. Upgrade om te ontgrendelen.",
    "settings.toast.englishSource": "Engels is de brontaal",
    "settings.toast.settingsSaved": "Instellingen opgeslagen",
    "settings.toast.syncComplete": "Shopify-synchronisatie voltooid",
    "settings.toast.autoTranslateComplete": "Automatische vertaling voltooid",
    "settings.localeScopeHint":
      " Vernieuw deze pagina daarna nadat je de machtigingen hebt goedgekeurd.",
    "settings.refreshLanguagesHint":
      " Gebruik de vernieuwknop als er recent talen in Shopify zijn toegevoegd.",
    "settings.help.buyPrefix":
      "Gebruikt voor niveau labels zoals „Buy 10” → „Achetez 10”.",
    "settings.help.cartDiscount":
      "Getoond in winkelwagen/checkout, bijv. 6% OFF. Gebruik {{ discount }} en {{ amount }}.",
    "settings.help.cartDiscountQty":
      "Gegroepeerd hoeveelheidslabel, bijv. „(qty 20)” → „(qté 20)”.",
    "pricing.compare.importExport": "Import & export (CSV / Excel)",
    "pricing.feature.importExport": "Import & export (CSV / Excel)",
  },
  pl: {
    "settings.neverSynced": "Nigdy nie synchronizowano",
    "settings.unknownTime": "Nieznany",
    "settings.toast.sheetsCreated":
      "Utworzono arkusze tłumaczeń dla wszystkich języków sklepu Shopify",
    "settings.toast.upgradeTranslations":
      "Tłumaczenia witryny są dostępne w Standard i Premium. Ulepsz plan, aby odblokować.",
    "settings.toast.englishSource": "Angielski jest językiem źródłowym",
    "settings.toast.settingsSaved": "Ustawienia zapisane",
    "settings.toast.syncComplete": "Synchronizacja Shopify zakończona",
    "settings.toast.autoTranslateComplete": "Automatyczne tłumaczenie zakończone",
    "settings.localeScopeHint":
      " Następnie odśwież tę stronę po zatwierdzeniu uprawnień.",
    "settings.refreshLanguagesHint":
      " Użyj przycisku odświeżania, jeśli niedawno dodano języki w Shopify.",
    "settings.help.buyPrefix":
      "Używane w etykietach progów, np. „Buy 10” → „Achetez 10”.",
    "settings.help.cartDiscount":
      "Pokazywane w koszyku/kasie, np. 6% OFF. Użyj {{ discount }} i {{ amount }}.",
    "settings.help.cartDiscountQty":
      "Etykieta ilości grupowej, np. „(qty 20)” → „(qté 20)”.",
  },
  cs: {
    "settings.neverSynced": "Nikdy nesynchronizováno",
    "settings.unknownTime": "Neznámé",
    "settings.toast.sheetsCreated":
      "Překladové listy vytvořeny pro všechny jazyky obchodu Shopify",
    "settings.toast.upgradeTranslations":
      "Překlady výlohy jsou dostupné ve Standard a Premium. Upgradujte pro odemčení.",
    "settings.toast.englishSource": "Angličtina je zdrojový jazyk",
    "settings.toast.settingsSaved": "Nastavení uloženo",
    "settings.toast.syncComplete": "Synchronizace Shopify dokončena",
    "settings.toast.autoTranslateComplete": "Automatický překlad dokončen",
    "settings.localeScopeHint":
      " Poté obnovte tuto stránku po schválení oprávnění.",
    "settings.refreshLanguagesHint":
      " Použijte tlačítko obnovení, pokud byly v Shopify nedávno přidány jazyky.",
    "settings.help.buyPrefix":
      "Používá se pro štítky stupňů jako „Buy 10“ → „Achetez 10“.",
    "settings.help.cartDiscount":
      "Zobrazeno v košíku/pokladně, např. 6% OFF. Použijte {{ discount }} a {{ amount }}.",
    "settings.help.cartDiscountQty":
      "Seskupený štítek množství, např. „(qty 20)“ → „(qté 20)“.",
  },
  da: {
    "settings.neverSynced": "Aldrig synkroniseret",
    "settings.unknownTime": "Ukendt",
    "settings.toast.sheetsCreated":
      "Oversættelsesark oprettet for alle Shopify-butikssprog",
    "settings.toast.upgradeTranslations":
      "Butiksoversættelser er tilgængelige på Standard og Premium. Opgrader for at låse op.",
    "settings.toast.englishSource": "Engelsk er kildesproget",
    "settings.toast.settingsSaved": "Indstillinger gemt",
    "settings.toast.syncComplete": "Shopify-synkronisering fuldført",
    "settings.toast.autoTranslateComplete": "Auto-oversættelse fuldført",
    "settings.localeScopeHint":
      " Opdater derefter denne side efter at have godkendt tilladelserne.",
    "settings.refreshLanguagesHint":
      " Brug opdateringsknappen, hvis der for nylig er tilføjet sprog i Shopify.",
    "settings.help.buyPrefix":
      "Bruges til trin-etiketter som „Buy 10“ → „Achetez 10“.",
    "settings.help.cartDiscount":
      "Vises i kurv/checkout, f.eks. 6% OFF. Brug {{ discount }} og {{ amount }}.",
    "settings.help.cartDiscountQty":
      "Grupperet mængdeetiket, f.eks. „(qty 20)“ → „(qté 20)“.",
  },
  sv: {
    "settings.neverSynced": "Aldrig synkad",
    "settings.unknownTime": "Okänd",
    "settings.toast.sheetsCreated":
      "Översättningsblad skapade för alla Shopify-butiksspråk",
    "settings.toast.upgradeTranslations":
      "Butiksöversättningar finns på Standard och Premium. Uppgradera för att låsa upp.",
    "settings.toast.englishSource": "Engelska är källspråket",
    "settings.toast.settingsSaved": "Inställningar sparade",
    "settings.toast.syncComplete": "Shopify-synk klar",
    "settings.toast.autoTranslateComplete": "Autoöversättning klar",
    "settings.localeScopeHint":
      " Uppdatera sedan den här sidan efter att du godkänt behörigheterna.",
    "settings.refreshLanguagesHint":
      " Använd uppdateringsknappen om språk nyligen lagts till i Shopify.",
    "settings.help.buyPrefix":
      "Används för nivåetiketter som „Buy 10“ → „Achetez 10“.",
    "settings.help.cartDiscount":
      "Visas i varukorg/kassa, t.ex. 6% OFF. Använd {{ discount }} och {{ amount }}.",
    "settings.help.cartDiscountQty":
      "Grupperad kvantitetsetikett, t.ex. „(qty 20)“ → „(qté 20)“.",
    "pricing.compare.importExport": "Import & export (CSV / Excel)",
    "pricing.feature.importExport": "Import & export (CSV / Excel)",
  },
  nb: {
    "settings.neverSynced": "Aldri synkronisert",
    "settings.unknownTime": "Ukjent",
    "settings.toast.sheetsCreated":
      "Oversettelsesark opprettet for alle Shopify-butikkspråk",
    "settings.toast.upgradeTranslations":
      "Butikkoversettelser er tilgjengelig på Standard og Premium. Oppgrader for å låse opp.",
    "settings.toast.englishSource": "Engelsk er kildespråket",
    "settings.toast.settingsSaved": "Innstillinger lagret",
    "settings.toast.syncComplete": "Shopify-synkronisering fullført",
    "settings.toast.autoTranslateComplete": "Auto-oversettelse fullført",
    "settings.localeScopeHint":
      " Oppdater deretter denne siden etter at du har godkjent tillatelsene.",
    "settings.refreshLanguagesHint":
      " Bruk oppdateringsknappen hvis språk nylig ble lagt til i Shopify.",
    "settings.help.buyPrefix":
      "Brukes til nivåetiketter som «Buy 10» → «Achetez 10».",
    "settings.help.cartDiscount":
      "Vises i handlekurv/checkout, f.eks. 6% OFF. Bruk {{ discount }} og {{ amount }}.",
    "settings.help.cartDiscountQty":
      "Gruppert mengdeetikett, f.eks. «(qty 20)» → «(qté 20)».",
  },
  fi: {
    "settings.neverSynced": "Ei koskaan synkronoitu",
    "settings.unknownTime": "Tuntematon",
    "settings.toast.sheetsCreated":
      "Käännösarkit luotu kaikille Shopify-kaupan kielille",
    "settings.toast.upgradeTranslations":
      "Kaupan käännökset ovat saatavilla Standard- ja Premium-suunnitelmissa. Päivitä avataksesi.",
    "settings.toast.englishSource": "Englanti on lähdekieli",
    "settings.toast.settingsSaved": "Asetukset tallennettu",
    "settings.toast.syncComplete": "Shopify-synkronointi valmis",
    "settings.toast.autoTranslateComplete": "Automaattikäännös valmis",
    "settings.localeScopeHint":
      " Päivitä sitten tämä sivu hyväksyttyäsi käyttöoikeudet.",
    "settings.refreshLanguagesHint":
      " Käytä päivityspainiketta, jos Shopifyhin on äskettäin lisätty kieliä.",
    "settings.help.buyPrefix":
      "Käytetään tasotunnisteissa kuten „Buy 10” → „Achetez 10”.",
    "settings.help.cartDiscount":
      "Näkyy ostoskorissa/kassalla, esim. 6% OFF. Käytä {{ discount }} ja {{ amount }}.",
    "settings.help.cartDiscountQty":
      "Ryhmitelty määrätunniste, esim. „(qty 20)” → „(qté 20)”.",
  },
  "pt-PT": {
    "settings.neverSynced": "Nunca sincronizado",
    "settings.unknownTime": "Desconhecido",
    "settings.toast.sheetsCreated":
      "Folhas de tradução criadas para todos os idiomas da loja Shopify",
    "settings.toast.upgradeTranslations":
      "As traduções da loja estão disponíveis no Standard e Premium. Atualize para desbloquear.",
    "settings.toast.englishSource": "O inglês é o idioma de origem",
    "settings.toast.settingsSaved": "Definições guardadas",
    "settings.toast.syncComplete": "Sincronização Shopify concluída",
    "settings.toast.autoTranslateComplete": "Tradução automática concluída",
    "settings.localeScopeHint":
      " Depois atualize esta página após aprovar as permissões.",
    "settings.refreshLanguagesHint":
      " Use o botão de atualizar se foram adicionados idiomas na Shopify recentemente.",
    "settings.help.buyPrefix":
      "Usado em etiquetas de níveis como «Buy 10» → «Achetez 10».",
    "settings.help.cartDiscount":
      "Mostrado no carrinho/checkout, ex. 6% OFF. Use {{ discount }} e {{ amount }}.",
    "settings.help.cartDiscountQty":
      "Etiqueta de quantidade agrupada, ex. «(qty 20)» → «(qté 20)».",
  },
  "pt-BR": {
    "settings.neverSynced": "Nunca sincronizado",
    "settings.unknownTime": "Desconhecido",
    "settings.toast.sheetsCreated":
      "Planilhas de tradução criadas para todos os idiomas da loja Shopify",
    "settings.toast.upgradeTranslations":
      "As traduções da loja estão disponíveis no Standard e Premium. Faça upgrade para desbloquear.",
    "settings.toast.englishSource": "O inglês é o idioma de origem",
    "settings.toast.settingsSaved": "Configurações salvas",
    "settings.toast.syncComplete": "Sincronização Shopify concluída",
    "settings.toast.autoTranslateComplete": "Tradução automática concluída",
    "settings.localeScopeHint":
      " Depois atualize esta página após aprovar as permissões.",
    "settings.refreshLanguagesHint":
      " Use o botão de atualizar se idiomas foram adicionados na Shopify recentemente.",
    "settings.help.buyPrefix":
      "Usado em rótulos de níveis como «Buy 10» → «Achetez 10».",
    "settings.help.cartDiscount":
      "Mostrado no carrinho/checkout, ex. 6% OFF. Use {{ discount }} e {{ amount }}.",
    "settings.help.cartDiscountQty":
      "Rótulo de quantidade agrupada, ex. «(qty 20)» → «(qté 20)».",
  },
  pt: null, // filled below
  th: {
    "settings.neverSynced": "ไม่เคยซิงค์",
    "settings.unknownTime": "ไม่ทราบ",
    "settings.toast.sheetsCreated":
      "สร้างแผ่นงานแปลสำหรับทุกภาษาของร้าน Shopify แล้ว",
    "settings.toast.upgradeTranslations":
      "การแปลหน้าร้านมีใน Standard และ Premium อัปเกรดเพื่อปลดล็อก",
    "settings.toast.englishSource": "ภาษาอังกฤษเป็นภาษาต้นฉบับ",
    "settings.toast.settingsSaved": "บันทึกการตั้งค่าแล้ว",
    "settings.toast.syncComplete": "ซิงค์ Shopify เสร็จแล้ว",
    "settings.toast.autoTranslateComplete": "แปลอัตโนมัติเสร็จแล้ว",
    "settings.localeScopeHint":
      " จากนั้นรีเฟรชหน้านี้หลังจากอนุมัติสิทธิ์แล้ว",
    "settings.refreshLanguagesHint":
      " ใช้ปุ่มรีเฟรชหากมีการเพิ่มภาษาใน Shopify เมื่อเร็วๆ นี้",
    "settings.help.buyPrefix":
      "ใช้สำหรับป้ายระดับ เช่น «Buy 10» → «Achetez 10»",
    "settings.help.cartDiscount":
      "แสดงในตะกร้า/เช็คเอาต์ เช่น 6% OFF ใช้ {{ discount }} และ {{ amount }}",
    "settings.help.cartDiscountQty":
      "ป้ายจำนวนแบบจัดกลุ่ม เช่น «(qty 20)» → «(qté 20)»",
  },
  ko: {
    "settings.neverSynced": "동기화한 적 없음",
    "settings.unknownTime": "알 수 없음",
    "settings.toast.sheetsCreated":
      "모든 Shopify 스토어 언어용 번역 시트가 생성되었습니다",
    "settings.toast.upgradeTranslations":
      "스토어프론트 번역은 Standard 및 Premium에서 사용할 수 있습니다. 업그레이드하여 잠금 해제하세요.",
    "settings.toast.englishSource": "영어가 원본 언어입니다",
    "settings.toast.settingsSaved": "설정이 저장되었습니다",
    "settings.toast.syncComplete": "Shopify 동기화 완료",
    "settings.toast.autoTranslateComplete": "자동 번역 완료",
    "settings.localeScopeHint":
      " 권한을 승인한 후 이 페이지를 새로고침하세요.",
    "settings.refreshLanguagesHint":
      " Shopify에 최근에 언어가 추가된 경우 새로고침 버튼을 사용하세요.",
    "settings.help.buyPrefix":
      "«Buy 10» → «Achetez 10» 같은 티어 라벨에 사용됩니다.",
    "settings.help.cartDiscount":
      "장바구니/결제에 표시, 예: 6% OFF. {{ discount }} 및 {{ amount }}를 사용하세요.",
    "settings.help.cartDiscountQty":
      "그룹 수량 라벨, 예: «(qty 20)» → «(qté 20)».",
  },
  "zh-CN": {
    "settings.neverSynced": "从未同步",
    "settings.unknownTime": "未知",
    "settings.toast.sheetsCreated":
      "已为所有 Shopify 商店语言创建翻译表",
    "settings.toast.upgradeTranslations":
      "店面翻译适用于 Standard 和 Premium。升级以解锁。",
    "settings.toast.englishSource": "英语是源语言",
    "settings.toast.settingsSaved": "设置已保存",
    "settings.toast.syncComplete": "Shopify 同步完成",
    "settings.toast.autoTranslateComplete": "自动翻译完成",
    "settings.localeScopeHint": " 批准权限后请刷新此页面。",
    "settings.refreshLanguagesHint":
      " 如果最近在 Shopify 中添加了语言，请使用刷新按钮。",
    "settings.help.buyPrefix":
      "用于档位标签，例如 «Buy 10» → «Achetez 10»。",
    "settings.help.cartDiscount":
      "显示在购物车/结账，例如 6% OFF。使用 {{ discount }} 和 {{ amount }}。",
    "settings.help.cartDiscountQty":
      "分组数量标签，例如 «(qty 20)» → «(qté 20)».",
  },
  "zh-TW": {
    "settings.neverSynced": "從未同步",
    "settings.unknownTime": "未知",
    "settings.toast.sheetsCreated":
      "已為所有 Shopify 商店語言建立翻譯表",
    "settings.toast.upgradeTranslations":
      "店面翻譯適用於 Standard 與 Premium。升級以解鎖。",
    "settings.toast.englishSource": "英文是來源語言",
    "settings.toast.settingsSaved": "設定已儲存",
    "settings.toast.syncComplete": "Shopify 同步完成",
    "settings.toast.autoTranslateComplete": "自動翻譯完成",
    "settings.localeScopeHint": " 核准權限後請重新整理此頁面。",
    "settings.refreshLanguagesHint":
      " 若最近在 Shopify 新增了語言，請使用重新整理按鈕。",
    "settings.help.buyPrefix":
      "用於級距標籤，例如 «Buy 10» → «Achetez 10»。",
    "settings.help.cartDiscount":
      "顯示於購物車/結帳，例如 6% OFF。使用 {{ discount }} 與 {{ amount }}。",
    "settings.help.cartDiscountQty":
      "分組數量標籤，例如 «(qty 20)» → «(qté 20)».",
  },
  tr: {
    "settings.neverSynced": "Hiç senkronize edilmedi",
    "settings.unknownTime": "Bilinmiyor",
    "settings.toast.sheetsCreated":
      "Tüm Shopify mağaza dilleri için çeviri sayfaları oluşturuldu",
    "settings.toast.upgradeTranslations":
      "Vitrin çevirileri Standard ve Premium’da kullanılabilir. Kilidi açmak için yükseltin.",
    "settings.toast.englishSource": "İngilizce kaynak dildir",
    "settings.toast.settingsSaved": "Ayarlar kaydedildi",
    "settings.toast.syncComplete": "Shopify senkronizasyonu tamamlandı",
    "settings.toast.autoTranslateComplete": "Otomatik çeviri tamamlandı",
    "settings.localeScopeHint":
      " İzinleri onayladıktan sonra bu sayfayı yenileyin.",
    "settings.refreshLanguagesHint":
      " Shopify’da yakın zamanda dil eklendiyse yenile düğmesini kullanın.",
    "offerEditor.discountedProducts": "İndirimli ürünler",
    "offerEditor.schedule": "Zamanlama",
    "offerEditor.targetCustomer": "Hedef müşteri",
    "offerEditor.cartCheckout": "Sepet ve ödeme",
    "offerEditor.buttonSettings": "Düğme ayarları",
    "offerEditor.advancedSettings": "Gelişmiş ayarlar",
    "offerEditor.themeSetup": "Tema kurulumu",
    "offerEditor.widgetText": "Widget metni (vitrin)",
    "offerEditor.widgetAppearance": "Widget görünümü (vitrin)",
  },
  ja: {
    "settings.neverSynced": "未同期",
    "settings.unknownTime": "不明",
    "settings.toast.sheetsCreated":
      "すべてのShopifyストア言語の翻訳シートを作成しました",
    "settings.toast.upgradeTranslations":
      "ストアフロント翻訳はStandardとPremiumで利用できます。アップグレードして解除してください。",
    "settings.toast.englishSource": "英語がソース言語です",
    "settings.toast.settingsSaved": "設定を保存しました",
    "settings.toast.syncComplete": "Shopify同期が完了しました",
    "settings.toast.autoTranslateComplete": "自動翻訳が完了しました",
    "settings.localeScopeHint":
      " 権限を承認したあと、このページを更新してください。",
    "settings.refreshLanguagesHint":
      " Shopifyで最近言語を追加した場合は、更新ボタンを使用してください。",
  },
  vi: {
    "settings.neverSynced": "Chưa từng đồng bộ",
    "settings.unknownTime": "Không rõ",
    "settings.toast.sheetsCreated":
      "Đã tạo bảng dịch cho tất cả ngôn ngữ cửa hàng Shopify",
    "settings.toast.upgradeTranslations":
      "Bản dịch storefront có trên Standard và Premium. Nâng cấp để mở khóa.",
    "settings.toast.englishSource": "Tiếng Anh là ngôn ngữ nguồn",
    "settings.toast.settingsSaved": "Đã lưu cài đặt",
    "settings.toast.syncComplete": "Đồng bộ Shopify hoàn tất",
    "settings.toast.autoTranslateComplete": "Dịch tự động hoàn tất",
    "settings.localeScopeHint":
      " Sau đó làm mới trang này sau khi phê duyệt quyền.",
    "settings.refreshLanguagesHint":
      " Dùng nút làm mới nếu gần đây đã thêm ngôn ngữ trong Shopify.",
  },
};

packs.pt = { ...packs["pt-PT"] };

let total = 0;
for (const [locale, pack] of Object.entries(packs)) {
  if (!pack) continue;
  const file = path.join(adminDir, `${locale}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`missing ${locale}`);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  let n = 0;
  for (const [k, v] of Object.entries(pack)) {
    if (data[k] !== v) {
      data[k] = v;
      n++;
    }
  }
  if (n) fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`${locale}: ${n}`);
  total += n;
}
console.log(`Done. ${total} updates.`);
