"use client";

// Confirmation native avant une transition de statut sensible (Archiver /
// Marquer vendue) — window.confirm() plutôt qu'un système de modales : le
// clic sur le bouton submit déclenche onClick avant la soumission du
// formulaire, et preventDefault() y annule l'appel à la Server Action liée
// (archiverAnnonceAction / marquerVendueAnnonceAction, inchangées).
type Props = {
  action: React.ComponentProps<"form">["action"];
  label: string;
  confirmMessage: string;
  className: string;
};

export default function BoutonAvecConfirmation({ action, label, confirmMessage, className }: Props) {
  return (
    <form action={action}>
      <button
        type="submit"
        className={className}
        style={{ padding: "6px 14px", fontSize: "13px", whiteSpace: "nowrap" }}
        onClick={(e) => {
          if (!window.confirm(confirmMessage)) {
            e.preventDefault();
          }
        }}
      >
        {label}
      </button>
    </form>
  );
}
