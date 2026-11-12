import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props} />
  );
}

export function CameraIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></Icon>; }
export function TrashIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" /></Icon>; }
export function SaveIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" strokeLinejoin="round" /><path d="M7 3v5h8V3M7 21v-7h10v7" /></Icon>; }
export function KeyIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M17 6l2 2M14 9l2 2" /></Icon>; }
export function LogoutIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></Icon>; }
export function DownloadIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 19h16" /></Icon>; }
export function UploadIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><path d="M12 21V9m0 0-4 4m4-4 4 4" /><path d="M4 5h16" /></Icon>; }
export function SendIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z" strokeLinejoin="round" /></Icon>; }
export function PlusIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>; }
export function CloseIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><path d="M18 6 6 18M6 6l12 12" /></Icon>; }
export function SparkleIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" strokeLinejoin="round" /><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" strokeLinejoin="round" /></Icon>; }
export function CopyIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></Icon>; }
export function SpeakerIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><path d="M5 9v6h4l5 4V5L9 9H5Z" strokeLinejoin="round" /><path d="M16.5 9.5a4 4 0 0 1 0 5" /></Icon>; }
export function StopIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><rect x="6" y="6" width="12" height="12" rx="1.5" /></Icon>; }
export function BellIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z" strokeLinejoin="round" /><path d="M10 18.5a2 2 0 0 0 4 0" /></Icon>; }
export function AccountIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><circle cx="12" cy="8" r="3.4" /><path d="M5 20c1-3.5 4-5.5 7-5.5s6 2 7 5.5" strokeLinecap="round" /></Icon>; }
export function ClipboardIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><rect x="5" y="4" width="14" height="17" rx="1.5" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 11h6M9 15h6" /></Icon>; }
export function PaletteIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1.1.9-2 2-2h2a4 4 0 0 0 4-4c0-4.4-4-7.5-9-7.5Z" strokeLinejoin="round" /><circle cx="7.5" cy="12" r="1" fill="currentColor" /><circle cx="9" cy="8" r="1" fill="currentColor" /><circle cx="14" cy="7.5" r="1" fill="currentColor" /></Icon>; }
export function FolderIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><path d="M3.5 7a1 1 0 0 1 1-1h5l1.5 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-14.5a1 1 0 0 1-1-1V7Z" strokeLinejoin="round" /></Icon>; }
export function SunIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.3M12 19.2v2.3M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.5 12h2.3M19.2 12h2.3M4.4 19.6l1.6-1.6M18 6l1.6-1.6" /></Icon>; }
export function MoonIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" strokeLinejoin="round" /></Icon>; }
export function MonitorIcon(p: SVGProps<SVGSVGElement>) { return <Icon {...p}><rect x="3" y="4" width="18" height="13" rx="1.5" /><path d="M8 21h8M12 17v4" /></Icon>; }
