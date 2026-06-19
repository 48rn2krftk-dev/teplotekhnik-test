import { Pencil, Plus, Trash2, Wrench, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ChainCorrectionPanel } from "../components/ChainCorrectionPanel";
import { NormComparison } from "../components/NormComparison";
import { uiText } from "../content";
import type {
  DriverRoute,
  FuelChain,
  ThuOperation,
} from "../domain/documents";
import type { ScreenId } from "../types";
import {
  analyzeChainLinks,
  calculateChainHotIdle,
  getChainDocumentEnd,
  getChainDocumentEndLocation,
  getChainDocumentStart,
  getChainDocumentStartLocation,
  sectionKey,
  sortChainDocuments,
  type ChainDocument,
} from "../utils/chainAnalysis";
import { buildSuggestedThuForGap } from "../utils/chainCorrections";
import {
  deleteDocument,
  getDocuments,
  saveDocument,
} from "../utils/documentStorage";
import { formatNumber, formatTime } from "../utils/format";
import { getSettings, subscribeSettingsChange } from "../utils/storage";

type ChainForm = {
  id: string | null;
  tankCapacity: string;
  selectedKeys: string[];
  search: string;
  createdAt: string | null;
};

function itemKey(item: ChainDocument): string {
  return `${item.type}:${item.document.id}`;
}

function itemTitle(item: ChainDocument): string {
  return item.type === "thu"
    ? `${uiText.chains.thu} № ${item.document.documentNumber} · ${
        uiText.thuLibrary.operationTypes[item.document.operationType]
      }`
    : `${uiText.chains.driverRoute} № ${item.document.routeNumber}${
        item.document.driverName ? ` · ${item.document.driverName}` : ""
      }`;
}

function compactItemTitle(item: ChainDocument): string {
  return item.type === "thu"
    ? `${uiText.chains.thu} ${item.document.documentNumber}`
    : `${uiText.chains.driverRoute} ${item.document.routeNumber}`;
}

function itemPeriod(item: ChainDocument): string {
  const start = new Date(getChainDocumentStart(item));
  const end = new Date(
    item.type === "thu"
      ? item.document.operationEnd
      : item.document.routeEnd
  );
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatter.format(start)} → ${formatter.format(end)}`;
}

function compactItemPeriod(item: ChainDocument): string {
  const start = new Date(getChainDocumentStart(item));
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return formatter.format(start);
}

function periodBetween(startValue: string, endValue: string): string {
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${formatter.format(new Date(startValue))} → ${formatter.format(
    new Date(endValue)
  )}`;
}

function itemLocomotives(item: ChainDocument): string {
  const locomotives = [
    ...new Set(
      item.document.sections.map(
        (section) =>
          `${section.series}-${section.locomotiveNumber}/${section.sectionNumber}`
      )
    ),
  ];

  return locomotives.join(" · ");
}

function chainTitle(items: ChainDocument[]): string {
  const locomotiveNumbers = [
    ...new Set(
      items.flatMap((item) =>
        item.document.sections.map(
          (section) => section.locomotiveNumber.trim()
        )
      )
    ),
  ].filter(Boolean);

  return locomotiveNumbers.length > 0
    ? `${uiText.chains.autoTitlePrefix} ${locomotiveNumbers.join(", ")}`
    : uiText.chains.autoTitlePrefix;
}

function documentNumber(item: ChainDocument): string {
  return item.type === "thu"
    ? item.document.documentNumber
    : item.document.routeNumber;
}

function searchableDocumentText(item: ChainDocument): string {
  return [
    item.type === "thu" ? "тху" : "мм",
    documentNumber(item),
    itemTitle(item),
    itemLocomotives(item),
    itemPeriod(item),
    itemLocation(item),
  ]
    .join(" ")
    .toLocaleLowerCase("ru-RU");
}

function itemLocation(item: ChainDocument): string {
  const start = getChainDocumentStartLocation(item);
  const end = getChainDocumentEndLocation(item);

  if (start && end && start !== end) return `${start} → ${end}`;
  return start ?? end ?? uiText.chains.locationUnknown;
}

function canAttachGapToThu(
  item: ChainDocument,
  field: "operationStart" | "operationEnd",
  value: string
): boolean {
  if (item.type !== "thu") return false;

  const start =
    field === "operationStart" ? value : item.document.operationStart;
  const end = field === "operationEnd" ? value : item.document.operationEnd;

  return (
    new Date(start).getTime() < new Date(end).getTime() &&
    new Date(start).getTime() >= new Date(item.document.shiftStart).getTime() &&
    new Date(end).getTime() <= new Date(item.document.shiftEnd).getTime()
  );
}

function newThuFuelLines(link: ReturnType<typeof analyzeChainLinks>[number]) {
  return link.fuelGaps.flatMap((gap) =>
    gap.previousFuel !== null && gap.nextFuel !== null
      ? [
          `${uiText.chains.sectionLabel(gap.sectionKey)}: ${formatNumber(
            gap.previousFuel
          )} / ${formatNumber(gap.nextFuel)} кг`,
        ]
      : []
  );
}

function suggestedNewThuFuelLines(
  link: ReturnType<typeof analyzeChainLinks>[number],
  tankCapacity: number | null
) {
  const suggestedThu = buildSuggestedThuForGap(link, tankCapacity);

  if (!suggestedThu) return newThuFuelLines(link);

  return suggestedThu.document.sections.map(
    (section) =>
      `${uiText.chains.sectionLabel(sectionKey(section))}: ${formatNumber(
        section.fuelAtStart
      )} / ${formatNumber(section.fuelAtEnd)} кг`
  );
}

function parseCapacity(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toForm(chain: FuelChain): ChainForm {
  return {
    id: chain.id,
    tankCapacity:
      chain.tankCapacity === null ? "" : formatNumber(chain.tankCapacity),
    selectedKeys: chain.itemIds.map((item) => `${item.type}:${item.id}`),
    search: "",
    createdAt: chain.createdAt,
  };
}

function toExpansionForm(chain: FuelChain, documents: ChainDocument[]): ChainForm {
  return {
    ...toForm(chain),
    search: documents
      .flatMap((item) =>
        item.document.sections.map((section) => section.locomotiveNumber)
      )
      .find((value) => value.trim()) ?? "",
  };
}

type FuelChainLibraryScreenProps = {
  onOpenScreen?: (screen: ScreenId) => void;
};

export function FuelChainLibraryScreen({
  onOpenScreen,
}: FuelChainLibraryScreenProps) {
  const [chains, setChains] = useState<FuelChain[]>([]);
  const [thuOperations, setThuOperations] = useState<ThuOperation[]>([]);
  const [driverRoutes, setDriverRoutes] = useState<DriverRoute[]>([]);
  const [form, setForm] = useState<ChainForm | null>(null);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [correctingChainId, setCorrectingChainId] = useState<string | null>(
    null
  );
  const [savedMessage, setSavedMessage] = useState("");
  const [settings, setSettings] = useState(() => getSettings());

  async function loadData() {
    try {
      const [storedChains, storedThu, storedRoutes] = await Promise.all([
        getDocuments("fuelChains"),
        getDocuments("thuOperations"),
        getDocuments("driverRoutes"),
      ]);
      setChains(
        storedChains.sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt)
        )
      );
      setThuOperations(storedThu);
      setDriverRoutes(storedRoutes);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    return subscribeSettingsChange(() => setSettings(getSettings()));
  }, []);

  const availableDocuments = useMemo<ChainDocument[]>(
    () =>
      sortChainDocuments([
        ...thuOperations.map(
          (document): ChainDocument => ({ type: "thu", document })
        ),
        ...driverRoutes.map(
          (document): ChainDocument => ({ type: "driverRoute", document })
        ),
      ]),
    [driverRoutes, thuOperations]
  );

  function resolveChainDocuments(chain: FuelChain): ChainDocument[] {
    return chain.itemIds
      .map((reference) => {
        if (reference.type === "thu") {
          const document = thuOperations.find(
            (item) => item.id === reference.id
          );
          return document
            ? ({ type: "thu", document } as ChainDocument)
            : null;
        }

        const document = driverRoutes.find(
          (item) => item.id === reference.id
        );
        return document
          ? ({ type: "driverRoute", document } as ChainDocument)
          : null;
      })
      .filter((item): item is ChainDocument => item !== null);
  }

  function selectedDocuments(): ChainDocument[] {
    if (!form) return [];
    return availableDocuments.filter((item) =>
      form.selectedKeys.includes(itemKey(item))
    );
  }

  function filteredDocuments(): ChainDocument[] {
    if (!form) return [];
    const query = form.search.trim().toLocaleLowerCase("ru-RU");
    return availableDocuments.filter((item) => {
      if (form.selectedKeys.includes(itemKey(item))) return false;
      return !query || searchableDocumentText(item).includes(query);
    });
  }

  async function handleSave() {
    if (!form) return;
    const selected = sortChainDocuments(selectedDocuments());

    if (selected.length < 2) {
      setError(uiText.chains.selectAtLeastTwo);
      return;
    }

    const capacity = parseCapacity(form.tankCapacity);
    if (form.tankCapacity.trim() && capacity === null) {
      setError(uiText.chains.tankCapacityError);
      return;
    }

    const now = new Date().toISOString();
    const chain: FuelChain = {
      id: form.id ?? crypto.randomUUID(),
      title: chainTitle(selected),
      itemIds: selected.map((item) => ({
        type: item.type,
        id: item.document.id,
      })),
      tankCapacity: capacity,
      corrections:
        chains.find((item) => item.id === form.id)?.corrections ?? [],
      createdAt: form.createdAt ?? now,
      updatedAt: now,
    };

    try {
      await saveDocument("fuelChains", chain);
      setForm(null);
      setError("");
      await loadData();
    } catch {
      setStorageError(true);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDocument("fuelChains", id);
      if (form?.id === id) setForm(null);
      await loadData();
    } catch {
      setStorageError(true);
    }
  }

  async function saveCorrections(
    chain: FuelChain,
    corrections: FuelChain["corrections"],
    correctedDocuments: ChainDocument[]
  ) {
    try {
      const now = new Date().toISOString();
      const knownKeys = new Set(
        chain.itemIds.map((item) => `${item.type}:${item.id}`)
      );
      const newThuDocuments = correctedDocuments.filter(
        (item): item is Extract<ChainDocument, { type: "thu" }> =>
          item.type === "thu" && !knownKeys.has(itemKey(item))
      );

      await Promise.all(
        newThuDocuments.map((item) =>
          saveDocument("thuOperations", {
            ...item.document,
            documentNumber:
              item.document.documentNumber === "новая"
                ? `${chain.title.replace(/\D+/g, "") || "цепочка"}-разрыв`
                : item.document.documentNumber,
            createdAt: item.document.createdAt || now,
            updatedAt: now,
          })
        )
      );

      await saveDocument("fuelChains", {
        ...chain,
        itemIds: correctedDocuments.map((item) => ({
          type: item.type,
          id: item.document.id,
        })),
        corrections,
        updatedAt: now,
      });
      setCorrectingChainId(null);
      setSavedMessage(uiText.chains.draftSaved);
      window.setTimeout(() => setSavedMessage(""), 1800);
      await loadData();
    } catch {
      setStorageError(true);
    }
  }

  return (
    <section className="screen">
      <div className="card">
        <div className="libraryHeader">
          <div className="sectionTitle">
            <h2>{uiText.chains.title}</h2>
            <p>{uiText.chains.description}</p>
          </div>
          {!form && availableDocuments.length >= 2 && (
            <button
              className="primaryIconButton"
              type="button"
              onClick={() =>
                setForm({
                  id: null,
                  tankCapacity: "",
                  selectedKeys: [],
                  search: "",
                  createdAt: null,
                })
              }
            >
              <Plus size={19} />
              {uiText.chains.add}
            </button>
          )}
        </div>

        {storageError && (
          <div className="errorBox">{uiText.chains.storageError}</div>
        )}
        {savedMessage && <div className="successBox">{savedMessage}</div>}

        {!form && availableDocuments.length < 2 && !storageError && (
          <p className="emptyHistory">{uiText.chains.noDocuments}</p>
        )}

        {form && (
          <div className="documentForm">
            <div className="documentFormHeader">
              <h3>{form.id ? uiText.chains.edit : uiText.chains.add}</h3>
              <button
                className="iconButton"
                type="button"
                aria-label={uiText.chains.cancel}
                onClick={() => setForm(null)}
              >
                <X size={19} />
              </button>
            </div>

            <label className="field">
              <span>{uiText.chains.tankCapacity}</span>
              <input
                value={form.tankCapacity}
                inputMode="decimal"
                onChange={(event) =>
                  setForm({ ...form, tankCapacity: event.target.value })
                }
              />
            </label>

            <div>
              <b>{uiText.chains.documents}</b>
              <p className="chainPickerHint">
                {uiText.chains.documentsDescription}
              </p>
              <label className="field compactField">
                <span>{uiText.chains.searchDocuments}</span>
                <input
                  value={form.search}
                  placeholder={uiText.chains.searchPlaceholder}
                  onChange={(event) =>
                    setForm({ ...form, search: event.target.value })
                  }
                />
              </label>

              <div className="chainSelectedDocuments">
                <b>{uiText.chains.selectedDocuments}</b>
                {selectedDocuments().length === 0 ? (
                  <p className="emptyHistory">
                    {uiText.chains.noSelectedDocuments}
                  </p>
                ) : (
                  <div className="chainDocumentPicker">
                    {selectedDocuments().map((item) => {
                      const key = itemKey(item);
                      return (
                        <div className="chainDocumentOption added" key={key}>
                          <span>
                            <b>{itemTitle(item)}</b>
                            <small className="chainDocumentLocomotives">
                              {itemLocomotives(item)}
                            </small>
                            <small>{itemPeriod(item)}</small>
                            <small>{itemLocation(item)}</small>
                          </span>
                          <button
                            className="iconButton"
                            type="button"
                            aria-label={uiText.chains.removeDocument}
                            onClick={() =>
                              setForm({
                                ...form,
                                selectedKeys: form.selectedKeys.filter(
                                  (itemKeyValue) => itemKeyValue !== key
                                ),
                              })
                            }
                          >
                            <X size={17} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="chainSearchResults">
                <div className="chainSearchHeader">
                  <b>{uiText.chains.availableDocuments}</b>
                  <div>
                    <button
                      className="secondaryButton compact inlineButton"
                      type="button"
                      onClick={() => onOpenScreen?.("thuLibrary")}
                    >
                      <Plus size={16} />
                      {uiText.chains.createThu}
                    </button>
                    <button
                      className="secondaryButton compact inlineButton"
                      type="button"
                      onClick={() => onOpenScreen?.("mmLibrary")}
                    >
                      <Plus size={16} />
                      {uiText.chains.createRoute}
                    </button>
                  </div>
                </div>
                <div className="chainDocumentPicker">
                  {filteredDocuments().map((item) => {
                  const key = itemKey(item);
                  return (
                    <div className="chainDocumentOption" key={key}>
                      <span>
                        <b>{itemTitle(item)}</b>
                        <small className="chainDocumentLocomotives">
                          {itemLocomotives(item)}
                        </small>
                        <small>{itemPeriod(item)}</small>
                        <small>{itemLocation(item)}</small>
                      </span>
                      <button
                        className="secondaryButton compact inlineButton"
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            selectedKeys: [...form.selectedKeys, key],
                          })
                        }
                      >
                        <Plus size={16} />
                        {uiText.chains.addDocument}
                      </button>
                    </div>
                  );
                })}
                  {filteredDocuments().length === 0 && (
                    <p className="emptyHistory">
                      {uiText.chains.documentsNotFound}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {error && <div className="errorBox">{error}</div>}

            <div className="documentFormActions">
              <button
                className="primaryButton"
                type="button"
                onClick={() => void handleSave()}
              >
                {uiText.chains.save}
              </button>
              <button
                className="secondaryButton compact"
                type="button"
                onClick={() => setForm(null)}
              >
                {uiText.chains.cancel}
              </button>
            </div>
          </div>
        )}

        {!form && chains.length === 0 && availableDocuments.length >= 2 && (
          <p className="emptyHistory">{uiText.chains.empty}</p>
        )}

        {!form && chains.length > 0 && (
          <div className="documentList">
            {chains.map((chain) => {
              const documents = resolveChainDocuments(chain);
              const links = analyzeChainLinks(documents);
              const hotIdle = calculateChainHotIdle(documents);
              const issueCount = links.reduce(
                (count, link) =>
                  count +
                  (link.timeStatus === "continuous" ? 0 : 1) +
                  (link.locationStatus === "continuous" ? 0 : 1) +
                  link.fuelGaps.filter(
                    (gap) => gap.status !== "continuous"
                  ).length,
                0
              );

              return (
                <article className="documentCard chainCard" key={chain.id}>
                  <div className="documentCardHeader">
                    <div>
                      <b>{chain.title}</b>
                      <p>
                        {uiText.chains.documentsCount(documents.length)} ·{" "}
                        {uiText.chains.linksCount(links.length)}
                      </p>
                    </div>
                    <div className="documentCardActions">
                      <button
                        className={
                          correctingChainId === chain.id
                            ? "iconButton active"
                            : "iconButton"
                        }
                        type="button"
                        aria-label={uiText.chains.correct}
                        title={uiText.chains.correct}
                        onClick={() =>
                          setCorrectingChainId(
                            correctingChainId === chain.id ? null : chain.id
                          )
                        }
                      >
                        <Wrench size={17} />
                      </button>
                      <button
                        className="iconButton"
                        type="button"
                        aria-label={uiText.chains.editAction}
                        onClick={() => setForm(toForm(chain))}
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        className="iconDangerButton"
                        type="button"
                        aria-label={uiText.chains.delete}
                        onClick={() => void handleDelete(chain.id)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>

                  {correctingChainId === chain.id ? (
                    <ChainCorrectionPanel
                      chain={chain}
                      documents={documents}
                      normFuelPerHour={settings.normFuelPerHour}
                      onCancel={() => setCorrectingChainId(null)}
                      onSave={(corrections, correctedDocuments) =>
                        saveCorrections(chain, corrections, correctedDocuments)
                      }
                    />
                  ) : (
                    <>
                  {issueCount === 0 && (
                    <div className="successBox">
                      {uiText.chains.chainIsContinuous}
                    </div>
                  )}

                  <div className="chainTileFlow">
                    <button
                      className="chainEdgeButton"
                      type="button"
                      onClick={() => setForm(toExpansionForm(chain, documents))}
                    >
                      <Plus size={16} />
                      {uiText.chains.addDocumentsToPiece}
                    </button>
                    {documents.map((item, index) => {
                      const link = links[index];
                      const hasLinkIssue =
                        link !== undefined &&
                        (link.timeStatus !== "continuous" ||
                          link.locationStatus === "gap" ||
                          link.fuelGaps.some(
                            (gap) => gap.status !== "continuous"
                          ));
                      const shouldSuggestNewThu =
                        link?.timeStatus === "gap" &&
                        link.locationStatus === "continuous" &&
                        !canAttachGapToThu(
                          link.previous,
                          "operationEnd",
                          getChainDocumentStart(link.next)
                        ) &&
                        !canAttachGapToThu(
                          link.next,
                          "operationStart",
                          getChainDocumentEnd(link.previous)
                        );

                      return (
                        <div className="chainTileGroup" key={itemKey(item)}>
                          <div className="chainDocumentTile">
                            <b>{compactItemTitle(item)}</b>
                            <span>{itemLocomotives(item)}</span>
                            <small>{compactItemPeriod(item)}</small>
                            <small>{itemLocation(item)}</small>
                          </div>

                          {link && (
                            <div className="chainBetween">
                              <div
                                className={`chainBreakNode ${
                                  hasLinkIssue ? "hasIssue" : "continuous"
                                }`}
                                title={
                                  hasLinkIssue
                                    ? uiText.chains.breakFound
                                    : uiText.chains.chainIsContinuous
                                }
                              >
                                {hasLinkIssue ? "!" : "→"}
                              </div>
                              {shouldSuggestNewThu && (
                                <details className="chainInsertedThuTile">
                                  <summary>{uiText.chains.newThuForGap}</summary>
                                  <small>
                                    {periodBetween(
                                      getChainDocumentEnd(link.previous),
                                      getChainDocumentStart(link.next)
                                    )}
                                  </small>
                                  <small>
                                    {link.previousLocation ??
                                      uiText.chains.locationUnknown}
                                  </small>
                                  {suggestedNewThuFuelLines(
                                    link,
                                    chain.tankCapacity
                                  ).map((line) => (
                                    <small key={line}>{line}</small>
                                  ))}
                                </details>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button
                      className="chainEdgeButton"
                      type="button"
                      onClick={() => setForm(toExpansionForm(chain, documents))}
                    >
                      <Plus size={16} />
                      {uiText.chains.addDocumentsToPiece}
                    </button>
                  </div>

                  {links.some(
                    (link) =>
                      link.timeStatus !== "continuous" ||
                      link.locationStatus !== "continuous" ||
                      link.fuelGaps.some((gap) => gap.status !== "continuous")
                  ) && (
                    <div className="chainBreakDetails">
                      {links.flatMap((link, index) => {
                        const hasIssue =
                          link.timeStatus !== "continuous" ||
                          link.locationStatus !== "continuous" ||
                          link.fuelGaps.some(
                            (gap) => gap.status !== "continuous"
                          );

                        if (!hasIssue) return [];

                        return [(
                        <div className="chainBreakDetail" key={index}>
                          <b>
                            {index + 1} → {index + 2}
                          </b>
                          <span
                            className={`chainStatus ${link.timeStatus}`}
                          >
                            {link.timeStatus === "gap"
                              ? `${uiText.chains.timeGap}: ${formatTime(
                                  link.timeDifferenceMinutes
                                )}`
                              : link.timeStatus === "overlap"
                                ? `${uiText.chains.timeOverlap}: ${formatTime(
                                    Math.abs(link.timeDifferenceMinutes)
                                  )}`
                                : uiText.chains.timeContinuous}
                          </span>
                          <span
                            className={`chainStatus location ${link.locationStatus}`}
                          >
                            {link.locationStatus === "gap"
                              ? `${uiText.chains.locationGap}: ${
                                  link.previousLocation
                                } → ${link.nextLocation}`
                              : link.locationStatus === "missing"
                                ? uiText.chains.locationMissing
                                : `${uiText.chains.locationContinuous}: ${link.previousLocation}`}
                          </span>
                          {link.fuelGaps.map((gap) => (
                            <span
                              className={`chainStatus fuel ${gap.status}`}
                              key={gap.sectionKey}
                            >
                              <b>
                                {uiText.chains.sectionLabel(gap.sectionKey)}
                              </b>
                              {gap.status === "missing"
                                ? uiText.chains.sectionMissing
                                : gap.status === "continuous"
                                  ? uiText.chains.fuelContinuous
                                  : `${uiText.chains.fuelGap}: ${
                                      gap.difference! > 0 ? "+" : ""
                                    }${formatNumber(gap.difference!)} кг`}
                            </span>
                          ))}
                        </div>
                        )];
                      })}
                    </div>
                  )}

                  {hotIdle && (
                    <div className="hotIdleResult compactResult">
                      <b>{uiText.chains.hotIdle}</b>
                      <span>
                        {uiText.chains.heatingTime}:{" "}
                        {formatTime(hotIdle.minutes)}
                      </span>
                      <span>
                        {uiText.chains.totalFuel}:{" "}
                        {formatNumber(hotIdle.fuelUsed)} кг
                      </span>
                      <span>
                        {uiText.chains.fuelPerHour}:{" "}
                        {formatNumber(hotIdle.fuelPerHour)} кг/ч
                      </span>
                      <NormComparison
                        result={hotIdle}
                        normFuelPerHour={settings.normFuelPerHour}
                      />
                    </div>
                  )}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
