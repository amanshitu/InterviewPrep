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
