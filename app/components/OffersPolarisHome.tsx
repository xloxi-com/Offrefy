import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useFetcher, useLocation, useRevalidator } from "react-router";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  DropZone,
  Icon,
  IndexFilters,
  IndexFiltersMode,
  IndexTable,
  IndexTableSelectionType,
  InlineStack,
  LegacyCard,
  Modal,
  Page,
  Pagination,
  Text,
  useSetIndexFiltersMode,
} from "@shopify/polaris";
import type {
  IndexFiltersProps,
  TabProps,
} from "@shopify/polaris";
import {
  PlanUpgradeBadge,
  planLockedActionContent,
} from "./PlanUpgradeBadge";
import {
  ArrowUpIcon,
  DeleteIcon,
  DiscountIcon,
  DuplicateIcon,
  EditIcon,
  RefreshIcon,
} from "@shopify/polaris-icons";

import styles from "../styles/offers-dashboard.module.css";
import {
  adminEmbeddedIndexActionPath,
  adminEmbeddedPath,
} from "../utils/adminEmbeddedPath";
import {
  formatCreatedAt,
  productScopeLabel,
  statusBadgeTone,
  truncateCampaignDisplayName,
} from "../utils/offers-display";
import type { VolumeDiscountWidgetPresentation } from "../utils/widgetDisplay";
import {
  buildOffersSampleCsv,
  OFFERS_SAMPLE_CSV_FILENAME,
} from "../utils/offersCsvSample";
import { preloadVolumeDiscountEditor } from "../utils/preloadVolumeDiscountEditor.client";
import { useAdminI18n } from "./AdminI18nProvider";
import type { AdminUiMessageKey } from "../utils/adminUiMessages";

export type OfferTab = "all" | "active" | "draft" | "scheduled";

export type OfferCampaignRow = {
  id: string;
  campaignName: string;
  productScope: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  widgetPresentation: VolumeDiscountWidgetPresentation;
};

type OfferListActionData =
  | {
      ok: true;
      intent:
        | "delete"
        | "duplicate"
        | "bulkActivate"
        | "bulkDeactivate"
        | "syncAll";
      count?: number;
    }
  | { ok: false; error: string };

type OffersCsvImportActionData =
  | {
      ok: true;
      imported: number;
      updated: number;
      skipped: number;
      errors: { row: number; message: string }[];
      activationNotice?: string;
    }
  | { ok: false; error: string };

type OffersCsvExportActionData =
  | {
      ok: true;
      intent: "exportCsv";
      filename: string;
      csv: string;
    }
  | { ok: false; error: string };

export type OffersPolarisHomeProps = {
  campaigns: OfferCampaignRow[];
  filteredCampaigns: OfferCampaignRow[];
  offerTab: OfferTab;
  setOfferTab: (t: OfferTab) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  sortSelected: string[];
  setSortSelected: (v: string[]) => void;
  toastSoon: (label: string) => void;
  /** Same string used to build `filteredCampaigns` (e.g. deferred search) so export matches the table. */
  exportSearchQuery: string;
  setScreen: (s: "home" | "select") => void;
  /** Used with React Router prefetch so edit opens faster after hover/focus. */
  offerEditTo: (id: string) => string;
  onCampaignsMutated: () => void;
  notify: (message: string) => void;
  /** Plan gates for import/export and campaign cap messaging. */
  canImportExport?: boolean;
  activeCount?: number;
  maxActiveCampaigns?: number | null;
  /** When true, Create / Duplicate are blocked (offer count at plan limit). */
  atOfferCap?: boolean;
  createOfferBlockedMessage?: string;
  onCreateOffer?: () => void;
  /** Prefer over toast when Create / Duplicate hit the plan cap. */
  onOfferLimitReached?: () => void;
};

const PAGE_SIZE = 50;

const STATUS_KEYS: Record<string, AdminUiMessageKey> = {
  active: "offers.status.active",
  draft: "offers.status.draft",
  scheduled: "offers.status.scheduled",
  archived: "offers.status.archived",
};

const SCOPE_KEYS: Record<string, AdminUiMessageKey> = {
  all: "offers.scope.all",
  "specific-products": "offers.scope.specificProducts",
  variants: "offers.scope.variants",
  collections: "offers.scope.collections",
  "group-products": "offers.scope.groupProducts",
};

function SortableColumnHeader({
  columnKey,
  label,
  sortSelected,
  onSort,
  defaultDir = "asc",
  ascLabel,
  descLabel,
  sortAria,
}: {
  columnKey: string;
  label: string;
  sortSelected: string[];
  onSort: (value: string[]) => void;
  defaultDir?: "asc" | "desc";
  ascLabel: string;
  descLabel: string;
  sortAria: (label: string, dir: string) => string;
}) {
  const sort = sortSelected[0] ?? "modified desc";
  const parts = sort.trim().split(/\s+/);
  const activeField = (parts[0] || "").toLowerCase();
  const activeDir = (parts[1] || "").toLowerCase();
  const isActive = activeField === columnKey;
  const isAsc = isActive && activeDir === "asc";
  const isDesc = isActive && activeDir === "desc";

  const toggleSort = () => {
    if (isActive) {
      onSort([`${columnKey} ${isAsc ? "desc" : "asc"}`]);
      return;
    }
    onSort([`${columnKey} ${defaultDir}`]);
  };

  return (
    <InlineStack gap="100" blockAlign="center" wrap={false}>
      <Text as="span" variant="bodySm" fontWeight="semibold">
        {label}
      </Text>
      <span
        className={`${styles.nameSortArrowWrap}${isDesc ? ` ${styles.nameSortArrowDesc}` : ""}`}
      >
        <Button
          variant="plain"
          size="micro"
          icon={ArrowUpIcon}
          accessibilityLabel={
            isDesc ? sortAria(label, descLabel) : sortAria(label, ascLabel)
          }
          pressed={isActive}
          onClick={toggleSort}
        />
      </span>
    </InlineStack>
  );
}

function tabIndex(offerTab: OfferTab): number {
  if (offerTab === "active") return 1;
  if (offerTab === "scheduled") return 2;
  if (offerTab === "draft") return 3;
  return 0;
}

function tabFromIndex(index: number): OfferTab {
  if (index === 1) return "active";
  if (index === 2) return "scheduled";
  if (index === 3) return "draft";
  return "all";
}

export const OffersPolarisHome = memo(function OffersPolarisHome({
  campaigns,
  filteredCampaigns,
  offerTab,
  setOfferTab,
  searchQuery,
  setSearchQuery,
  sortSelected,
  setSortSelected,
  exportSearchQuery,
  setScreen,
  offerEditTo,
  onCampaignsMutated,
  notify,
  canImportExport = false,
  activeCount = 0,
  maxActiveCampaigns = 5,
  atOfferCap = false,
  createOfferBlockedMessage = "You’ve reached your plan’s offer limit. Upgrade to create more.",
  onCreateOffer,
  onOfferLimitReached,
}: OffersPolarisHomeProps) {
  const { t } = useAdminI18n();
  const { search } = useLocation();
  const listIndexAction = adminEmbeddedIndexActionPath(search);
  const listFetcher = useFetcher<OfferListActionData>();
  const syncAllFetcher = useFetcher<OfferListActionData>();
  const csvImportFetcher = useFetcher<OffersCsvImportActionData>();
  const csvExportFetcher = useFetcher<OffersCsvExportActionData>();
  const wasSubmittingList = useRef(false);
  const wasSubmittingSyncAll = useRef(false);
  const wasSubmittingCsvImport = useRef(false);
  const wasSubmittingCsvExport = useRef(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(
    null,
  );
  const [importModalOpen, setImportModalOpen] = useState(false);

  const { mode, setMode } = useSetIndexFiltersMode(IndexFiltersMode.Default);
  const [pageIndex, setPageIndex] = useState(0);

  const offerTabs: TabProps[] = useMemo(
    () => [
      { id: "all", content: t("offers.tab.all"), isLocked: true },
      { id: "active", content: t("offers.tab.active"), isLocked: true },
      { id: "scheduled", content: t("offers.tab.scheduled"), isLocked: true },
      { id: "draft", content: t("offers.tab.draft"), isLocked: true },
    ],
    [t],
  );

  const sortOptions: NonNullable<IndexFiltersProps["sortOptions"]> = useMemo(
    () => [
      { label: t("offers.col.campaignName"), value: "name asc", directionLabel: t("offers.sort.az") },
      { label: t("offers.col.campaignName"), value: "name desc", directionLabel: t("offers.sort.za") },
      { label: t("offers.col.discountType"), value: "discount asc", directionLabel: t("offers.sort.az") },
      { label: t("offers.col.discountType"), value: "discount desc", directionLabel: t("offers.sort.za") },
      { label: t("offers.col.campaignType"), value: "type asc", directionLabel: t("offers.sort.az") },
      { label: t("offers.col.campaignType"), value: "type desc", directionLabel: t("offers.sort.za") },
      { label: t("offers.col.applyTo"), value: "apply asc", directionLabel: t("offers.sort.az") },
      { label: t("offers.col.applyTo"), value: "apply desc", directionLabel: t("offers.sort.za") },
      { label: t("offers.col.impression"), value: "impression asc", directionLabel: t("offers.sort.lowHigh") },
      { label: t("offers.col.impression"), value: "impression desc", directionLabel: t("offers.sort.highLow") },
      { label: t("offers.col.cr"), value: "cr asc", directionLabel: t("offers.sort.lowHigh") },
      { label: t("offers.col.cr"), value: "cr desc", directionLabel: t("offers.sort.highLow") },
      { label: t("offers.col.orderApplied"), value: "orders asc", directionLabel: t("offers.sort.lowHigh") },
      { label: t("offers.col.orderApplied"), value: "orders desc", directionLabel: t("offers.sort.highLow") },
      { label: t("offers.col.lastModified"), value: "modified desc", directionLabel: t("offers.sort.newest") },
      { label: t("offers.col.lastModified"), value: "modified asc", directionLabel: t("offers.sort.oldest") },
      { label: t("offers.col.createdAt"), value: "created desc", directionLabel: t("offers.sort.newest") },
      { label: t("offers.col.createdAt"), value: "created asc", directionLabel: t("offers.sort.oldest") },
      { label: t("offers.col.status"), value: "status asc", directionLabel: t("offers.sort.az") },
      { label: t("offers.col.status"), value: "status desc", directionLabel: t("offers.sort.za") },
    ],
    [t],
  );

  const sortAria = useCallback(
    (label: string, dir: string) => t("offers.sortAscAria", { label, dir }),
    [t],
  );

  const translateStatus = useCallback(
    (status: string) => {
      const key = STATUS_KEYS[status.toLowerCase()];
      return key ? t(key) : status;
    },
    [t],
  );

  const translateScope = useCallback(
    (scope: string) => {
      const key = SCOPE_KEYS[scope];
      return key ? t(key) : productScopeLabel(scope);
    },
    [t],
  );

  const translateCampaignType = useCallback(
    (presentation?: VolumeDiscountWidgetPresentation) => {
      if (presentation === "volume_table") return t("offers.type.volumeDiscount");
      return t("offers.type.quantityBreaks");
    },
    [t],
  );

  // Warm editor on hover/focus only — eager import raced React Router's
  // document.head CSS injection and crashed Offers with appendChild on null.
  const warmEditorChunk = useCallback(() => {
    preloadVolumeDiscountEditor();
  }, []);

  const { pageRows, total, rangeStart, rangeEnd, hasPrevious, hasNext } =
    useMemo(() => {
      const n = filteredCampaigns.length;
      const maxPage = Math.max(0, Math.ceil(n / PAGE_SIZE) - 1);
      const safePage = Math.min(pageIndex, maxPage);
      const start = safePage * PAGE_SIZE;
      const end = Math.min(start + PAGE_SIZE, n);
      return {
        pageRows: filteredCampaigns.slice(start, end),
        total: n,
        rangeStart: n === 0 ? 0 : start + 1,
        rangeEnd: end,
        hasPrevious: safePage > 0,
        hasNext: end < n,
      };
    }, [filteredCampaigns, pageIndex]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(filteredCampaigns.length / PAGE_SIZE) - 1);
    setPageIndex((p) => Math.min(p, maxPage));
  }, [filteredCampaigns.length]);

  useEffect(() => {
    setPageIndex(0);
  }, [offerTab, searchQuery, sortSelected]);

  const [selectedResources, setSelectedResources] = useState<string[]>([]);

  const clearSelection = useCallback(() => {
    setSelectedResources([]);
  }, []);

  const handleOffersSelectionChange = useCallback(
    (
      selectionType: string,
      toggleType: boolean,
      selection?: string | [number, number],
      _position?: number,
    ) => {
      const allFilteredIds = filteredCampaigns.map((c) => c.id);

      if (selectionType === IndexTableSelectionType.Page) {
        setSelectedResources(toggleType ? allFilteredIds : []);
        return;
      }

      if (selectionType === IndexTableSelectionType.All) {
        setSelectedResources(toggleType ? allFilteredIds : []);
        return;
      }

      if (selectionType === IndexTableSelectionType.Single) {
        const id = selection as string;
        setSelectedResources((prev) =>
          toggleType
            ? prev.includes(id)
              ? prev
              : [...prev, id]
            : prev.filter((x) => x !== id),
        );
        return;
      }

      if (selectionType === IndexTableSelectionType.Multi) {
        if (!selection) return;
        const sel = selection as [number, number];
        setSelectedResources((currentSelectedResources) => {
          const ids: string[] = [];
          for (let i = sel[0]; i <= sel[1]; i++) {
            const row = pageRows[i];
            if (!row) continue;
            const id = row.id;
            if (
              (toggleType && !currentSelectedResources.includes(id)) ||
              (!toggleType && currentSelectedResources.includes(id))
            ) {
              ids.push(id);
            }
          }
          return toggleType
            ? [...currentSelectedResources, ...ids]
            : currentSelectedResources.filter((id) => !ids.includes(id));
        });
        return;
      }

      if (selectionType === IndexTableSelectionType.Range) {
        if (!selection) return;
        const sel = selection as [number, number];
        setSelectedResources((currentSelectedResources) => {
          const resourceIds = pageRows.map((c) => c.id);
          const selectedIds = resourceIds.slice(
            Number(sel[0]),
            Number(sel[1]) + 1,
          );
          const isIndeterminate = selectedIds.some((id) =>
            currentSelectedResources.includes(id),
          );
          const isChecked = selectedIds.every((id) =>
            currentSelectedResources.includes(id),
          );
          const isSelectingAllInRange =
            !isChecked && (toggleType || isIndeterminate);
          if (isSelectingAllInRange) {
            return [...new Set([...currentSelectedResources, ...selectedIds])];
          }
          return currentSelectedResources.filter((id) => !selectedIds.includes(id));
        });
      }
    },
    [pageRows, filteredCampaigns],
  );

  const selectedItemsCountForTable = selectedResources.length;

  useEffect(() => {
    clearSelection();
  }, [offerTab, searchQuery, sortSelected, clearSelection]);

  useEffect(() => {
    if (listFetcher.state !== "idle") {
      wasSubmittingList.current = true;
      return;
    }
    if (!wasSubmittingList.current) return;
    wasSubmittingList.current = false;
    const d = listFetcher.data;
    if (!d) return;
    if (d.ok) {
      if (d.intent === "duplicate") {
        notify(t("offers.toast.duplicated"));
      } else if (d.intent === "delete") {
        const n = d.count ?? 1;
        notify(
          n > 1
            ? t("offers.toast.removedPlural", { n })
            : t("offers.toast.removed"),
        );
        setPendingDeleteIds(null);
        clearSelection();
      } else if (d.intent === "bulkActivate") {
        const n = d.count ?? 1;
        notify(
          n > 1
            ? t("offers.toast.activatedPlural", { n })
            : t("offers.toast.activated"),
        );
        clearSelection();
      } else if (d.intent === "bulkDeactivate") {
        const n = d.count ?? 1;
        notify(
          n > 1
            ? t("offers.toast.draftedPlural", { n })
            : t("offers.toast.drafted"),
        );
        clearSelection();
      }
      onCampaignsMutated();
    } else {
      notify(d.error);
    }
  }, [
    listFetcher.state,
    listFetcher.data,
    notify,
    onCampaignsMutated,
    clearSelection,
    t,
  ]);

  useEffect(() => {
    if (syncAllFetcher.state !== "idle") {
      wasSubmittingSyncAll.current = true;
      return;
    }
    if (!wasSubmittingSyncAll.current) return;
    wasSubmittingSyncAll.current = false;
    const d = syncAllFetcher.data;
    if (!d) return;
    if (d.ok && d.intent === "syncAll") {
      notify(t("offers.toast.synced"));
      onCampaignsMutated();
    } else if (!d.ok) {
      notify(d.error);
    }
  }, [syncAllFetcher.state, syncAllFetcher.data, notify, onCampaignsMutated, t]);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importOverwriteCampaign, setImportOverwriteCampaign] = useState(false);

  const resetImportModal = useCallback(() => {
    setImportModalOpen(false);
    setImportFile(null);
    setImportOverwriteCampaign(false);
  }, []);

  useEffect(() => {
    if (csvImportFetcher.state !== "idle") {
      wasSubmittingCsvImport.current = true;
      return;
    }
    if (!wasSubmittingCsvImport.current) return;
    wasSubmittingCsvImport.current = false;
    const d = csvImportFetcher.data;
    if (!d) return;
    if (d.ok) {
      const errParts = d.errors.slice(0, 5).map((e) =>
        t("offers.toast.rowError", { row: e.row, message: e.message }),
      );
      const errMore =
        d.errors.length > 5
          ? t("offers.toast.rowErrorsMore", { n: d.errors.length - 5 })
          : "";
      const errMsg =
        d.errors.length > 0
          ? t("offers.toast.rowErrorsCount", {
              n: d.errors.length,
              details: `${errParts.join(" · ")}${errMore}`,
            })
          : "";
      const summaryParts: string[] = [];
      if (d.imported > 0) {
        summaryParts.push(t("offers.toast.importCreated", { n: d.imported }));
      }
      if (d.updated > 0) {
        summaryParts.push(t("offers.toast.importUpdated", { n: d.updated }));
      }
      if (d.skipped > 0) {
        summaryParts.push(t("offers.toast.importSkipped", { n: d.skipped }));
      }
      const summary =
        summaryParts.length > 0
          ? summaryParts.join(", ")
          : t("offers.toast.importNone");
      if (d.activationNotice) {
        notify(`${d.activationNotice}${errMsg}`);
      } else {
        notify(t("offers.toast.importSummary", { summary }) + errMsg);
      }
      if (d.imported > 0 || d.updated > 0) {
        onCampaignsMutated();
      }
      resetImportModal();
    } else {
      notify(d.error);
    }
  }, [
    csvImportFetcher.state,
    csvImportFetcher.data,
    notify,
    onCampaignsMutated,
    resetImportModal,
    t,
  ]);

  useEffect(() => {
    if (csvExportFetcher.state !== "idle") {
      wasSubmittingCsvExport.current = true;
      return;
    }
    if (!wasSubmittingCsvExport.current) return;
    wasSubmittingCsvExport.current = false;
    const d = csvExportFetcher.data;
    if (!d) return;
    if (d.ok && d.intent === "exportCsv") {
      const blob = new Blob([d.csv], {
        type: "text/csv;charset=utf-8",
      });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = d.filename || "offrefy-offers.csv";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      notify(t("offers.toast.exported"));
    } else if (!d.ok) {
      notify(d.error);
    }
  }, [csvExportFetcher.state, csvExportFetcher.data, notify, t]);

  const listMutationPending =
    listFetcher.state !== "idle" || syncAllFetcher.state !== "idle";
  const listMutationSubmitting = listFetcher.state === "submitting";

  const submitSyncAll = useCallback(() => {
    if (syncAllFetcher.state !== "idle" || campaigns.length === 0) return;
    const fd = new FormData();
    fd.set("_action", "syncAll");
    syncAllFetcher.submit(fd, { method: "post", action: listIndexAction });
  }, [campaigns.length, listIndexAction, syncAllFetcher]);

  const showOfferLimitReached = useCallback(() => {
    if (onOfferLimitReached) {
      onOfferLimitReached();
      return;
    }
    notify(createOfferBlockedMessage);
  }, [createOfferBlockedMessage, notify, onOfferLimitReached]);

  const submitDuplicate = (campaignId: string) => {
    if (atOfferCap) {
      showOfferLimitReached();
      return;
    }
    const fd = new FormData();
    fd.set("_action", "duplicate");
    fd.set("campaignId", campaignId);
    listFetcher.submit(fd, { method: "post", action: listIndexAction });
  };

  const confirmDelete = () => {
    if (!pendingDeleteIds?.length) return;
    const fd = new FormData();
    fd.set("_action", "delete");
    for (const id of pendingDeleteIds) {
      fd.append("campaignIds", id);
    }
    listFetcher.submit(fd, { method: "post", action: listIndexAction });
  };

  const submitBulkStatus = (bulkIntent: "bulkActivate" | "bulkDeactivate") => {
    if (selectedResources.length === 0) return;
    const fd = new FormData();
    fd.set("_action", bulkIntent);
    for (const id of selectedResources) {
      fd.append("campaignIds", id);
    }
    listFetcher.submit(fd, { method: "post", action: listIndexAction });
  };

  const atCampaignCap =
    maxActiveCampaigns != null && activeCount >= maxActiveCampaigns;

  const upgradeLabel = t("common.upgradePlan");

  const offersTableBulkActions = useMemo(
    () => [
      {
        content: t("offers.bulk.active"),
        disabled: listMutationPending || atCampaignCap,
        suffix: atCampaignCap ? <PlanUpgradeBadge /> : undefined,
        onAction: () => {
          if (atCampaignCap) {
            showOfferLimitReached();
            return;
          }
          submitBulkStatus("bulkActivate");
        },
      },
      {
        content: t("offers.bulk.draft"),
        onAction: () => submitBulkStatus("bulkDeactivate"),
        disabled: listMutationPending,
      },
      {
        content: t("offers.bulk.delete"),
        onAction: () => setPendingDeleteIds([...selectedResources]),
        destructive: true,
        disabled: listMutationPending,
      },
    ],
    [
      atCampaignCap,
      listMutationPending,
      selectedResources,
      showOfferLimitReached,
      t,
    ],
  );

  const csvImportAction = adminEmbeddedPath("/app/offers/import", search);
  const csvImportPending = csvImportFetcher.state !== "idle";
  const csvExportPending = csvExportFetcher.state !== "idle";
  const syncAllPending = syncAllFetcher.state !== "idle";
  const canExportOffers =
    canImportExport &&
    campaigns.length > 0 &&
    filteredCampaigns.length > 0;

  const submitExportCsv = useCallback(() => {
    if (csvExportPending || !canExportOffers) {
      if (!canImportExport) {
        notify(t("offers.toast.importPremium"));
      }
      return;
    }
    const fd = new FormData();
    fd.set("_action", "exportCsv");
    fd.set("listTab", offerTab);
    fd.set("listQ", exportSearchQuery);
    fd.set("listSort", sortSelected[0] ?? "modified desc");
    csvExportFetcher.submit(fd, { method: "post", action: listIndexAction });
  }, [
    canExportOffers,
    canImportExport,
    csvExportFetcher,
    csvExportPending,
    exportSearchQuery,
    listIndexAction,
    notify,
    offerTab,
    sortSelected,
    t,
  ]);

  const submitCsvImport = () => {
    if (!importFile) return;
    const fd = new FormData();
    fd.set("file", importFile);
    if (importOverwriteCampaign) {
      fd.set("overwriteCampaign", "1");
    }
    csvImportFetcher.submit(fd, {
      method: "post",
      action: csvImportAction,
      /* RR defaults to urlencoded for bare FormData — files need multipart. */
      encType: "multipart/form-data",
    });
  };

  const handleImportCsvDrop = useCallback(
    (_dropFiles: File[], acceptedFiles: File[]) => {
      setImportFile(acceptedFiles[0] ?? null);
    },
    [],
  );

  const handleImportCsvDropRejected = useCallback(() => {
    setImportFile(null);
    notify(t("offers.toast.csvOnly"));
  }, [notify, t]);

  const downloadSampleCsv = useCallback(() => {
    const blob = new Blob([buildOffersSampleCsv()], {
      type: "text/csv;charset=utf-8",
    });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = OFFERS_SAMPLE_CSV_FILENAME;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  }, []);

  const importCsvDropZone = importFile ? (
    <BlockStack gap="200" inlineAlign="center">
      <Text as="p" variant="bodyMd" fontWeight="semibold">
        {importFile.name}
      </Text>
      <Text as="p" variant="bodySm" tone="subdued">
        {t("offers.import.replaceHint", {
          size: (importFile.size / 1024).toFixed(1),
        })}
      </Text>
    </BlockStack>
  ) : (
    <DropZone.FileUpload
      actionTitle={t("offers.import.addCsv")}
      actionHint={t("offers.import.dropHint")}
    />
  );

  const deleteCount = pendingDeleteIds?.length ?? 0;

  const indexFiltersCancelAction = useMemo(
    () => ({
      onAction: () => setMode(IndexFiltersMode.Default),
      disabled: false,
      loading: false,
    }),
    [setMode],
  );

  const pagePrimaryAction = useMemo(
    () => ({
      content: planLockedActionContent(
        t("offers.createOffer"),
        atOfferCap,
        upgradeLabel,
      ),
      disabled: atOfferCap,
      onAction: () => {
        if (atOfferCap) {
          showOfferLimitReached();
          return;
        }
        if (onCreateOffer) {
          onCreateOffer();
          return;
        }
        warmEditorChunk();
        setScreen("select");
      },
    }),
    [
      atOfferCap,
      onCreateOffer,
      setScreen,
      showOfferLimitReached,
      t,
      upgradeLabel,
      warmEditorChunk,
    ],
  );

  const revalidator = useRevalidator();
  const isReloading = revalidator.state === "loading";

  const pageSecondaryActions = useMemo(
    () => [
      {
        // Icon-only reload (separate from Sync all), same pattern as Analytics.
        content: "",
        icon: RefreshIcon,
        loading: isReloading,
        disabled: isReloading,
        onAction: () => revalidator.revalidate(),
        accessibilityLabel: t("common.reload"),
      },
      {
        content: t("offers.syncAll"),
        loading: syncAllPending,
        disabled:
          campaigns.length === 0 ||
          syncAllPending ||
          listFetcher.state !== "idle",
        onAction: submitSyncAll,
      },
      {
        content: planLockedActionContent(
          t("common.export"),
          !canImportExport,
          upgradeLabel,
        ),
        loading: csvExportPending,
        disabled: csvExportPending || !canExportOffers,
        onAction: submitExportCsv,
      },
      {
        content: planLockedActionContent(
          t("common.import"),
          !canImportExport,
          upgradeLabel,
        ),
        onAction: () => {
          if (!canImportExport) {
            notify(t("offers.toast.importPremium"));
            return;
          }
          setImportModalOpen(true);
        },
        disabled: !canImportExport,
      },
    ],
    [
      campaigns.length,
      canExportOffers,
      canImportExport,
      csvExportPending,
      isReloading,
      listFetcher.state,
      notify,
      revalidator,
      submitExportCsv,
      submitSyncAll,
      syncAllPending,
      t,
      upgradeLabel,
    ],
  );

  const emptyStateCard = (
    <Card>
      <BlockStack gap="400" inlineAlign="center">
        <Box padding="400" background="bg-surface-secondary" borderRadius="200">
          <Icon source={DiscountIcon} tone="base" />
        </Box>
        <BlockStack gap="200" inlineAlign="center">
          <Text variant="headingMd" as="h2">
            {t("offers.emptyTitle")}
          </Text>
          <Text tone="subdued" alignment="center" as="p">
            {t("offers.emptyBody")}
          </Text>
        </BlockStack>
        <InlineStack gap="200" blockAlign="center">
          <Button
            variant="primary"
            disabled={atOfferCap}
            onClick={() => {
              if (atOfferCap) {
                showOfferLimitReached();
                return;
              }
              if (onCreateOffer) {
                onCreateOffer();
                return;
              }
              warmEditorChunk();
              setScreen("select");
            }}
          >
            {t("offers.createOffer")}
          </Button>
          {atOfferCap ? <PlanUpgradeBadge /> : null}
        </InlineStack>
      </BlockStack>
    </Card>
  );

  const tableCard =
    campaigns.length === 0 ? null : (
      <LegacyCard>
        <IndexFilters
          sortOptions={sortOptions}
          sortSelected={sortSelected}
          queryValue={searchQuery}
          queryPlaceholder={t("offers.searchPlaceholder")}
          onQueryChange={setSearchQuery}
          onQueryClear={() => setSearchQuery("")}
          onSort={setSortSelected}
          cancelAction={indexFiltersCancelAction}
          tabs={offerTabs}
          selected={tabIndex(offerTab)}
          onSelect={(index) => setOfferTab(tabFromIndex(index))}
          canCreateNewView={false}
          filters={[]}
          appliedFilters={[]}
          onClearAll={() => setSearchQuery("")}
          mode={mode}
          setMode={setMode}
          disableKeyboardShortcuts
        />
        {filteredCampaigns.length === 0 ? (
          <Box padding="600">
            <Text tone="subdued" as="p">
              {t("offers.emptyFilter")}
            </Text>
          </Box>
        ) : (
          <Fragment>
          <div className={styles.tableWrap}>
            <IndexTable
              resourceName={{
                singular: t("offers.resource.singular"),
                plural: t("offers.resource.plural"),
              }}
              itemCount={filteredCampaigns.length}
              hasMoreItems={false}
              selectedItemsCount={selectedItemsCountForTable}
              bulkActions={offersTableBulkActions}
              onSelectionChange={handleOffersSelectionChange}
              selectable
              headings={[
                {
                  id: "campaign-name",
                  title: (
                    <SortableColumnHeader
                      columnKey="name"
                      label={t("offers.col.campaignName")}
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                      ascLabel={t("offers.sort.az")}
                      descLabel={t("offers.sort.za")}
                      sortAria={sortAria}
                    />
                  ),
                },
                {
                  id: "discount-type",
                  title: (
                    <SortableColumnHeader
                      columnKey="discount"
                      label={t("offers.col.discountType")}
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                      ascLabel={t("offers.sort.az")}
                      descLabel={t("offers.sort.za")}
                      sortAria={sortAria}
                    />
                  ),
                },
                {
                  id: "campaign-type",
                  title: (
                    <SortableColumnHeader
                      columnKey="type"
                      label={t("offers.col.campaignType")}
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                      ascLabel={t("offers.sort.az")}
                      descLabel={t("offers.sort.za")}
                      sortAria={sortAria}
                    />
                  ),
                },
                {
                  id: "apply-to",
                  title: (
                    <SortableColumnHeader
                      columnKey="apply"
                      label={t("offers.col.applyTo")}
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                      ascLabel={t("offers.sort.az")}
                      descLabel={t("offers.sort.za")}
                      sortAria={sortAria}
                    />
                  ),
                },
                {
                  id: "impression",
                  title: (
                    <SortableColumnHeader
                      columnKey="impression"
                      label={t("offers.col.impression")}
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                      ascLabel={t("offers.sort.lowHigh")}
                      descLabel={t("offers.sort.highLow")}
                      sortAria={sortAria}
                    />
                  ),
                },
                {
                  id: "cr",
                  title: (
                    <SortableColumnHeader
                      columnKey="cr"
                      label={t("offers.col.cr")}
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                      ascLabel={t("offers.sort.lowHigh")}
                      descLabel={t("offers.sort.highLow")}
                      sortAria={sortAria}
                    />
                  ),
                },
                {
                  id: "order-applied",
                  title: (
                    <SortableColumnHeader
                      columnKey="orders"
                      label={t("offers.col.orderApplied")}
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                      ascLabel={t("offers.sort.lowHigh")}
                      descLabel={t("offers.sort.highLow")}
                      sortAria={sortAria}
                    />
                  ),
                },
                {
                  id: "last-modified",
                  title: (
                    <SortableColumnHeader
                      columnKey="modified"
                      label={t("offers.col.lastModified")}
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                      defaultDir="desc"
                      ascLabel={t("offers.sort.oldest")}
                      descLabel={t("offers.sort.newest")}
                      sortAria={sortAria}
                    />
                  ),
                },
                {
                  id: "created-at",
                  title: (
                    <SortableColumnHeader
                      columnKey="created"
                      label={t("offers.col.createdAt")}
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                      defaultDir="desc"
                      ascLabel={t("offers.sort.oldest")}
                      descLabel={t("offers.sort.newest")}
                      sortAria={sortAria}
                    />
                  ),
                },
                {
                  id: "status",
                  title: (
                    <SortableColumnHeader
                      columnKey="status"
                      label={t("offers.col.status")}
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                      ascLabel={t("offers.sort.az")}
                      descLabel={t("offers.sort.za")}
                      sortAria={sortAria}
                    />
                  ),
                },
                { title: t("offers.col.actions"), id: "offers-actions-col" },
              ]}
              lastColumnSticky
            >
              {pageRows.map((c, index) => (
                <IndexTable.Row
                  id={c.id}
                  key={c.id}
                  position={index}
                  selected={selectedResources.includes(c.id)}
                  onClick={() => {}}
                >
                  <IndexTable.Cell>
                    <Link
                      to={offerEditTo(c.id)}
                      prefetch="intent"
                      className={styles.nameEditButton}
                      title={c.campaignName}
                      aria-label={t("offers.editAria", { name: c.campaignName })}
                      onMouseEnter={warmEditorChunk}
                      onFocus={warmEditorChunk}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (listMutationPending) e.preventDefault();
                      }}
                    >
                      {truncateCampaignDisplayName(c.campaignName)}
                    </Link>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span">{t("offers.discountType.product")}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span">
                      {translateCampaignType(c.widgetPresentation)}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span">{translateScope(c.productScope)}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text tone="subdued" as="span">
                      —
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text tone="subdued" as="span">
                      —
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text tone="subdued" as="span">
                      —
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span">{formatCreatedAt(c.updatedAt)}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span">{formatCreatedAt(c.createdAt)}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={statusBadgeTone(c.status)}>
                      {translateStatus(c.status)}
                    </Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <InlineStack gap="0" blockAlign="center" wrap={false}>
                      <Link
                        to={offerEditTo(c.id)}
                        prefetch="intent"
                        className={styles.editIconLink}
                        aria-label={t("common.edit")}
                        onMouseEnter={warmEditorChunk}
                        onFocus={warmEditorChunk}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (listMutationPending) e.preventDefault();
                        }}
                      >
                        <Icon source={EditIcon} tone="base" />
                      </Link>
                      <Button
                        variant="tertiary"
                        icon={DuplicateIcon}
                        accessibilityLabel={
                          atOfferCap
                            ? `${t("common.duplicate")} — ${t("common.upgradePlan")}`
                            : t("common.duplicate")
                        }
                        disabled={listMutationPending || atOfferCap}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => submitDuplicate(c.id)}
                      />
                      <Button
                        variant="tertiary"
                        tone="critical"
                        icon={DeleteIcon}
                        accessibilityLabel={t("common.delete")}
                        disabled={listMutationPending}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => setPendingDeleteIds([c.id])}
                      />
                    </InlineStack>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </div>
          <Box
            padding="300"
            borderColor="border"
            borderBlockStartWidth="025"
            background="bg-surface-secondary"
          >
            <Pagination
              type="table"
              hasPrevious={hasPrevious}
              hasNext={hasNext}
              onPrevious={() => setPageIndex((p) => Math.max(0, p - 1))}
              onNext={() => setPageIndex((p) => p + 1)}
              label={t("offers.pagination", {
                start: rangeStart,
                end: rangeEnd,
                total: total.toLocaleString(),
              })}
            />
          </Box>
          </Fragment>
        )}
      </LegacyCard>
    );

  return (
    <>
    <div className={styles.offersPageShell}>
    <Page
      fullWidth
      title={t("offers.title")}
      primaryAction={pagePrimaryAction}
      secondaryActions={pageSecondaryActions}
    >
      <Box maxWidth="100%" minWidth="0">
        <BlockStack gap="400">
          {campaigns.length === 0 ? emptyStateCard : tableCard}
        </BlockStack>
      </Box>
    </Page>
    </div>

      <Modal
        open={pendingDeleteIds !== null}
        onClose={() => setPendingDeleteIds(null)}
        title={
          deleteCount > 1
            ? t("offers.delete.titlePlural", { n: deleteCount })
            : t("offers.delete.title")
        }
        primaryAction={{
          content:
            deleteCount > 1
              ? t("offers.delete.confirmPlural")
              : t("offers.delete.confirm"),
          destructive: true,
          loading: listMutationSubmitting,
          onAction: confirmDelete,
        }}
        secondaryActions={[
          {
            content: t("common.cancel"),
            disabled: listMutationPending,
            onAction: () => setPendingDeleteIds(null),
          },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            {deleteCount > 1
              ? t("offers.delete.bodyPlural")
              : t("offers.delete.body")}
          </Text>
        </Modal.Section>
      </Modal>

      <Modal
        open={importModalOpen}
        onClose={() => {
          if (csvImportPending) return;
          resetImportModal();
        }}
        title={t("offers.import.title")}
        primaryAction={{
          content: t("common.import"),
          loading: csvImportPending,
          disabled: !importFile || csvImportPending,
          onAction: submitCsvImport,
        }}
        secondaryActions={[
          {
            content: t("common.cancel"),
            disabled: csvImportPending,
            onAction: resetImportModal,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <BlockStack gap="200">
              <Text as="p" tone="subdued">
                {t("offers.import.body")}
              </Text>
              <InlineStack>
                <Button
                  variant="plain"
                  onClick={downloadSampleCsv}
                  disabled={csvImportPending}
                >
                  {t("offers.import.downloadTemplate")}
                </Button>
              </InlineStack>
            </BlockStack>
            <DropZone
              accept=".csv,text/csv,text/comma-separated-values,application/vnd.ms-excel"
              type="file"
              allowMultiple={false}
              disabled={csvImportPending}
              outline
              variableHeight
              customValidator={(file) => {
                const name = file.name.toLowerCase();
                return (
                  name.endsWith(".csv") ||
                  file.type === "text/csv" ||
                  file.type === "application/vnd.ms-excel"
                );
              }}
              onDrop={handleImportCsvDrop}
              onDropRejected={handleImportCsvDropRejected}
            >
              {importCsvDropZone}
            </DropZone>
            <Checkbox
              label={t("offers.import.overwrite")}
              helpText={t("offers.import.overwriteHelp")}
              checked={importOverwriteCampaign}
              disabled={csvImportPending}
              onChange={setImportOverwriteCampaign}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  );
});
