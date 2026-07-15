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
  campaignTypeLabel,
  discountTypeLabel,
  formatCreatedAt,
  productScopeLabel,
  statusBadgeTone,
  statusLabel,
  truncateCampaignDisplayName,
} from "../utils/offers-display";
import type { VolumeDiscountWidgetPresentation } from "../utils/widgetDisplay";
import {
  buildOffersSampleCsv,
  OFFERS_SAMPLE_CSV_FILENAME,
} from "../utils/offersCsvSample";
import { preloadVolumeDiscountEditor } from "../utils/preloadVolumeDiscountEditor.client";

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
};

const offerTabs: TabProps[] = [
  { id: "all", content: "All", isLocked: true },
  { id: "active", content: "Active", isLocked: true },
  { id: "scheduled", content: "Scheduled", isLocked: true },
  { id: "draft", content: "Draft", isLocked: true },
];

const PAGE_SIZE = 50;

const sortOptions: NonNullable<IndexFiltersProps["sortOptions"]> = [
  { label: "Campaign name", value: "name asc", directionLabel: "A–Z" },
  { label: "Campaign name", value: "name desc", directionLabel: "Z–A" },
  { label: "Discount type", value: "discount asc", directionLabel: "A–Z" },
  { label: "Discount type", value: "discount desc", directionLabel: "Z–A" },
  { label: "Campaign type", value: "type asc", directionLabel: "A–Z" },
  { label: "Campaign type", value: "type desc", directionLabel: "Z–A" },
  { label: "Apply to", value: "apply asc", directionLabel: "A–Z" },
  { label: "Apply to", value: "apply desc", directionLabel: "Z–A" },
  {
    label: "Impression",
    value: "impression asc",
    directionLabel: "Low to high",
  },
  {
    label: "Impression",
    value: "impression desc",
    directionLabel: "High to low",
  },
  { label: "CR", value: "cr asc", directionLabel: "Low to high" },
  { label: "CR", value: "cr desc", directionLabel: "High to low" },
  {
    label: "Order applied",
    value: "orders asc",
    directionLabel: "Low to high",
  },
  {
    label: "Order applied",
    value: "orders desc",
    directionLabel: "High to low",
  },
  {
    label: "Last modified",
    value: "modified desc",
    directionLabel: "Newest first",
  },
  {
    label: "Last modified",
    value: "modified asc",
    directionLabel: "Oldest first",
  },
  {
    label: "Created at",
    value: "created desc",
    directionLabel: "Newest first",
  },
  {
    label: "Created at",
    value: "created asc",
    directionLabel: "Oldest first",
  },
  { label: "Status", value: "status asc", directionLabel: "A–Z" },
  { label: "Status", value: "status desc", directionLabel: "Z–A" },
];

function SortableColumnHeader({
  columnKey,
  label,
  sortSelected,
  onSort,
  defaultDir = "asc",
  ascLabel = "A to Z",
  descLabel = "Z to A",
}: {
  columnKey: string;
  label: string;
  sortSelected: string[];
  onSort: (value: string[]) => void;
  defaultDir?: "asc" | "desc";
  ascLabel?: string;
  descLabel?: string;
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
            isDesc
              ? `Sort ${label} ${descLabel}`
              : `Sort ${label} ${ascLabel}`
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
}: OffersPolarisHomeProps) {
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

  useEffect(() => {
    preloadVolumeDiscountEditor();
  }, []);

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
        notify(
          "Offer duplicated as draft — open it to publish discounts",
        );
      } else if (d.intent === "delete") {
        const n = d.count ?? 1;
        notify(n > 1 ? `${n} offers removed` : "Offer removed");
        setPendingDeleteIds(null);
        clearSelection();
      } else if (d.intent === "bulkActivate") {
        const n = d.count ?? 1;
        notify(n > 1 ? `${n} offers set to active` : "Offer set to active");
        clearSelection();
      } else if (d.intent === "bulkDeactivate") {
        const n = d.count ?? 1;
        notify(n > 1 ? `${n} offers set to draft` : "Offer set to draft");
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
      notify("All active discounts synced to Shopify");
      onCampaignsMutated();
    } else if (!d.ok) {
      notify(d.error);
    }
  }, [syncAllFetcher.state, syncAllFetcher.data, notify, onCampaignsMutated]);

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
      const errParts = d.errors.slice(0, 5).map(
        (e) => `Row ${e.row}: ${e.message}`,
      );
      const errMore =
        d.errors.length > 5
          ? ` …and ${d.errors.length - 5} more`
          : "";
      const errMsg =
        d.errors.length > 0
          ? ` ${d.errors.length} row error(s). ${errParts.join(" · ")}${errMore}`
          : "";
      const summaryParts: string[] = [];
      if (d.imported > 0) summaryParts.push(`created ${d.imported}`);
      if (d.updated > 0) summaryParts.push(`updated ${d.updated}`);
      if (d.skipped > 0) summaryParts.push(`skipped ${d.skipped} existing`);
      const summary =
        summaryParts.length > 0
          ? summaryParts.join(", ")
          : "no offers imported";
      if (d.activationNotice) {
        notify(`${d.activationNotice}${errMsg}`);
      } else {
        notify(`Import: ${summary}.${errMsg}`);
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
      notify("Excel CSV downloaded — edit columns and Import when ready");
    } else if (!d.ok) {
      notify(d.error);
    }
  }, [csvExportFetcher.state, csvExportFetcher.data, notify]);

  const listMutationPending =
    listFetcher.state !== "idle" || syncAllFetcher.state !== "idle";
  const listMutationSubmitting = listFetcher.state === "submitting";

  const submitSyncAll = useCallback(() => {
    if (syncAllFetcher.state !== "idle" || campaigns.length === 0) return;
    const fd = new FormData();
    fd.set("_action", "syncAll");
    syncAllFetcher.submit(fd, { method: "post", action: listIndexAction });
  }, [campaigns.length, listIndexAction, syncAllFetcher]);

  const submitDuplicate = (campaignId: string) => {
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

  const offersTableBulkActions = useMemo(
    () => [
      {
        content: "Active",
        onAction: () => submitBulkStatus("bulkActivate"),
        disabled: listMutationPending,
      },
      {
        content: "Draft",
        onAction: () => submitBulkStatus("bulkDeactivate"),
        disabled: listMutationPending,
      },
      {
        content: "Delete",
        onAction: () => setPendingDeleteIds([...selectedResources]),
        destructive: true,
        disabled: listMutationPending,
      },
    ],
    [listMutationPending, selectedResources],
  );

  const csvImportAction = adminEmbeddedPath("/app/offers/import", search);
  const csvImportPending = csvImportFetcher.state !== "idle";
  const csvExportPending = csvExportFetcher.state !== "idle";
  const syncAllPending = syncAllFetcher.state !== "idle";
  const canExportOffers =
    campaigns.length > 0 && filteredCampaigns.length > 0;

  const submitExportCsv = useCallback(() => {
    if (csvExportPending || !canExportOffers) return;
    const fd = new FormData();
    fd.set("_action", "exportCsv");
    fd.set("listTab", offerTab);
    fd.set("listQ", exportSearchQuery);
    fd.set("listSort", sortSelected[0] ?? "modified desc");
    csvExportFetcher.submit(fd, { method: "post", action: listIndexAction });
  }, [
    canExportOffers,
    csvExportFetcher,
    csvExportPending,
    exportSearchQuery,
    listIndexAction,
    offerTab,
    sortSelected,
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
    notify("Choose a .csv file (max 5 MB)");
  }, [notify]);

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
        {(importFile.size / 1024).toFixed(1)} KB — drop another file or click to
        replace
      </Text>
    </BlockStack>
  ) : (
    <DropZone.FileUpload
      actionTitle="Add CSV file"
      actionHint="or drop file to upload"
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
      content: "Create offer",
      onAction: () => {
        warmEditorChunk();
        setScreen("select");
      },
    }),
    [setScreen, warmEditorChunk],
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
        accessibilityLabel: "Reload",
      },
      {
        content: "Sync all",
        loading: syncAllPending,
        disabled:
          campaigns.length === 0 ||
          syncAllPending ||
          listFetcher.state !== "idle",
        onAction: submitSyncAll,
      },
      {
        content: "Export",
        loading: csvExportPending,
        disabled: csvExportPending || !canExportOffers,
        onAction: submitExportCsv,
      },
      { content: "Import", onAction: () => setImportModalOpen(true) },
    ],
    [
      campaigns.length,
      canExportOffers,
      csvExportPending,
      isReloading,
      listFetcher.state,
      revalidator,
      submitExportCsv,
      submitSyncAll,
      syncAllPending,
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
            First up: Create An Offer
          </Text>
          <Text tone="subdued" alignment="center" as="p">
            Your discount campaigns will appear here once created. Choose from
            our templates to launch your first revenue-boosting offer in under 2
            minutes.
          </Text>
        </BlockStack>
        <Button
          variant="primary"
          onClick={() => {
            warmEditorChunk();
            setScreen("select");
          }}
        >
          Create offer
        </Button>
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
          queryPlaceholder="Searching in all"
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
              No offers match your filters. Try another tab or search.
            </Text>
          </Box>
        ) : (
          <Fragment>
          <div className={styles.tableWrap}>
            <IndexTable
              resourceName={{ singular: "offer", plural: "offers" }}
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
                      label="Campaign name"
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                    />
                  ),
                },
                {
                  id: "discount-type",
                  title: (
                    <SortableColumnHeader
                      columnKey="discount"
                      label="Discount type"
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                    />
                  ),
                },
                {
                  id: "campaign-type",
                  title: (
                    <SortableColumnHeader
                      columnKey="type"
                      label="Campaign type"
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                    />
                  ),
                },
                {
                  id: "apply-to",
                  title: (
                    <SortableColumnHeader
                      columnKey="apply"
                      label="Apply to"
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                    />
                  ),
                },
                {
                  id: "impression",
                  title: (
                    <SortableColumnHeader
                      columnKey="impression"
                      label="Impression"
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                      ascLabel="low to high"
                      descLabel="high to low"
                    />
                  ),
                },
                {
                  id: "cr",
                  title: (
                    <SortableColumnHeader
                      columnKey="cr"
                      label="CR"
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                      ascLabel="low to high"
                      descLabel="high to low"
                    />
                  ),
                },
                {
                  id: "order-applied",
                  title: (
                    <SortableColumnHeader
                      columnKey="orders"
                      label="Order applied"
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                      ascLabel="low to high"
                      descLabel="high to low"
                    />
                  ),
                },
                {
                  id: "last-modified",
                  title: (
                    <SortableColumnHeader
                      columnKey="modified"
                      label="Last modified"
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                      defaultDir="desc"
                      ascLabel="oldest first"
                      descLabel="newest first"
                    />
                  ),
                },
                {
                  id: "created-at",
                  title: (
                    <SortableColumnHeader
                      columnKey="created"
                      label="Created at"
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                      defaultDir="desc"
                      ascLabel="oldest first"
                      descLabel="newest first"
                    />
                  ),
                },
                {
                  id: "status",
                  title: (
                    <SortableColumnHeader
                      columnKey="status"
                      label="Status"
                      sortSelected={sortSelected}
                      onSort={setSortSelected}
                    />
                  ),
                },
                { title: "Actions", id: "offers-actions-col" },
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
                      aria-label={`Edit ${c.campaignName}`}
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
                    <Text as="span">{discountTypeLabel()}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span">
                      {campaignTypeLabel(c.widgetPresentation)}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span">{productScopeLabel(c.productScope)}</Text>
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
                      {statusLabel(c.status)}
                    </Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <InlineStack gap="0" blockAlign="center" wrap={false}>
                      <Link
                        to={offerEditTo(c.id)}
                        prefetch="intent"
                        className={styles.editIconLink}
                        aria-label="Edit"
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
                        accessibilityLabel="Duplicate"
                        disabled={listMutationPending}
                        onPointerDown={(
                          e: ReactPointerEvent<HTMLButtonElement>,
                        ) => e.stopPropagation()}
                        onClick={() => submitDuplicate(c.id)}
                      />
                      <Button
                        variant="tertiary"
                        tone="critical"
                        icon={DeleteIcon}
                        accessibilityLabel="Delete"
                        disabled={listMutationPending}
                        onPointerDown={(
                          e: ReactPointerEvent<HTMLButtonElement>,
                        ) => e.stopPropagation()}
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
              label={`${rangeStart}-${rangeEnd} of ${total.toLocaleString()} offers`}
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
      title="Offers"
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
            ? `Delete ${deleteCount} offers?`
            : "Delete this offer?"
        }
        primaryAction={{
          content: deleteCount > 1 ? "Delete offers" : "Delete offer",
          destructive: true,
          loading: listMutationSubmitting,
          onAction: confirmDelete,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            disabled: listMutationPending,
            onAction: () => setPendingDeleteIds(null),
          },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            {deleteCount > 1
              ? "This removes the selected offers from the app and deletes their automatic discounts in Shopify. This cannot be undone."
              : "This removes the offer from the app and deletes its automatic discounts in Shopify. This cannot be undone."}
          </Text>
        </Modal.Section>
      </Modal>

      <Modal
        open={importModalOpen}
        onClose={() => {
          if (csvImportPending) return;
          resetImportModal();
        }}
        title="Import offers (Excel / CSV)"
        primaryAction={{
          content: "Import",
          loading: csvImportPending,
          disabled: !importFile || csvImportPending,
          onAction: submitCsvImport,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            disabled: csvImportPending,
            onAction: resetImportModal,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <BlockStack gap="200">
              <Text as="p" tone="subdued">
                Download the template, edit in Excel, save as CSV, then upload.
                All allowed values are in the template’s OPTIONS row.
              </Text>
              <InlineStack>
                <Button
                  variant="plain"
                  onClick={downloadSampleCsv}
                  disabled={csvImportPending}
                >
                  Download template
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
              label="Overwrite existing campaigns"
              helpText="Update matching names instead of skipping them."
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
