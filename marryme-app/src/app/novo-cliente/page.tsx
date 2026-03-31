// Redirecionamento permanente: /novo-cliente → /novo
import { redirect } from "next/navigation";

export default function NovoClienteRedirect() {
  redirect("/novo");
}
