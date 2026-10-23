import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "lucide-react";
import "./AccessibleModal.css";

let activeModal = null;

export default function AccessibleModal({
  title,
  onClose,
  onBack = null,
  children,
  className = "",
}) {
  const titleId = useId();
  const closeButtonRef = useRef(null);
  const modalRef = useRef(null);
  const modalId = useRef(Symbol("modal"));
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousModal = activeModal;
    activeModal = modalId.current;
    const root = document.getElementById("root");
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    closeButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (activeModal !== modalId.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = modalRef.current?.querySelectorAll(
        "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])",
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      activeModal = previousModal;
      if (root) root.inert = wasInert;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  return createPortal(
    <div
      className="taskflow-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={modalRef}
        className={`taskflow-modal-panel ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="taskflow-modal-header">
          <div className="taskflow-modal-title-group" style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
            {onBack && (
              <button
                type="button"
                className="taskflow-modal-back-btn"
                onClick={onBack}
                aria-label="Back to previous screen"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                <span>Back</span>
              </button>
            )}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="taskflow-icon-button"
            type="button"
            aria-label={typeof title === "string" ? `Close ${title}` : "Close modal"}
            onClick={onClose}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  );
}
