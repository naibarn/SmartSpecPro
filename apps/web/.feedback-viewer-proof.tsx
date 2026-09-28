import React, {useState,useRef,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {Dialog,DialogContent,DialogTitle} from '../../packages/ui/src/components/ui/dialog';
import {Button} from '../../packages/ui/src/components/ui/button';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {FeedbackLightboxZoomControls} from './client/src/pages/FeedbackLightboxZoomControls';
import {FEEDBACK_LIGHTBOX_ZOOM_DEFAULT,getFeedbackLightboxImageStyle} from './client/src/pages/feedbackHubZoom';
const AuthenticatedAttachmentImage=(props:any)=><img {...props}/>;
const getAuthenticatedAttachmentUrl=(x:any)=>x;
const openAuthenticatedAttachment=async()=>{};
const imageAttachments=[1,2,3].map(id=>({id,fileName:'image-'+id+'.svg',fileUrl:'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${id===1?8000:3000}" height="${id===1?12000:1800}"><rect width="100%" height="100%" fill="${id===1?'coral':'lightblue'}"/><text x="200" y="500" font-size="200">Image ${id}</text></svg>`)}));
function App(){
const [lightboxOpen,setLightboxOpen]=useState(true);
const [lightboxIndex,setLightboxIndex]=useState(0);
const [lightboxZoom,setLightboxZoom]=useState(1);
const [lightboxImageSize,setLightboxImageSize]=useState<any>(null);
const [lightboxPanning,setLightboxPanning]=useState(false);
const lightboxViewportRef=useRef<any>(null);
const lightboxPanRef=useRef<any>(null);
  const openLightbox = (attachmentId: number) => {
    const idx = imageAttachments.findIndex((a: any) => a.id === attachmentId);
    setLightboxIndex(idx >= 0 ? idx : 0);
    setLightboxZoom(FEEDBACK_LIGHTBOX_ZOOM_DEFAULT);
    setLightboxImageSize(null);
    setLightboxOpen(true);
  };

  const navigateLightbox = (direction: "prev" | "next") => {
    if (imageAttachments.length === 0) return;
    setLightboxIndex(prev => {
      if (direction === "prev") {
        return prev === 0 ? imageAttachments.length - 1 : prev - 1;
      }
      return prev === imageAttachments.length - 1 ? 0 : prev + 1;
    });
  };

  const handleLightboxPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button, a")) return;

    const viewport = event.currentTarget;
    if (
      viewport.scrollWidth <= viewport.clientWidth &&
      viewport.scrollHeight <= viewport.clientHeight
    ) {
      return;
    }

    event.preventDefault();
    lightboxPanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    viewport.setPointerCapture(event.pointerId);
    setLightboxPanning(true);
  };

  const handleLightboxPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const pan = lightboxPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;

    event.preventDefault();
    const viewport = event.currentTarget;
    viewport.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
    viewport.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
  };

  const stopLightboxPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = lightboxPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;

    lightboxPanRef.current = null;
    setLightboxPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  useEffect(() => {
    setLightboxZoom(FEEDBACK_LIGHTBOX_ZOOM_DEFAULT);
    setLightboxImageSize(null);
    lightboxPanRef.current = null;
    setLightboxPanning(false);
    requestAnimationFrame(() => {
      lightboxViewportRef.current?.scrollTo({ left: 0, top: 0 });
    });
  }, [lightboxIndex]);

  // Keyboard navigation for the lightbox (Escape is handled by the Dialog
  // itself; we only need Arrow keys here).
  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") navigateLightbox("prev");
      if (e.key === "ArrowRight") navigateLightbox("next");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxOpen, imageAttachments.length]);
return <><button style={{position:"fixed",right:16,top:16,zIndex:9999}} id="bell">Bell</button>              <Dialog
                open={lightboxOpen}
                onOpenChange={open => {
                  setLightboxOpen(open);
                  if (!open) {
                    setLightboxZoom(FEEDBACK_LIGHTBOX_ZOOM_DEFAULT);
                    setLightboxImageSize(null);
                    lightboxPanRef.current = null;
                    setLightboxPanning(false);
                  }
                }}
              >
                <DialogContent
                  fullscreen
                  layerIndex={10000}
                  className="relative h-[100dvh] w-[100vw] max-w-none rounded-none p-0 overflow-hidden flex flex-col [&>button]:bg-background [&>button]:text-foreground [&>button]:opacity-100"
                >
                  <DialogTitle className="sr-only">ภาพแนบ Feedback</DialogTitle>
                  {imageAttachments[lightboxIndex] && (
                    <>
                      <div
                        ref={lightboxViewportRef}
                        className={`relative flex-1 min-h-0 overflow-auto bg-black select-none ${
                          lightboxZoom > FEEDBACK_LIGHTBOX_ZOOM_DEFAULT
                            ? lightboxPanning
                              ? "cursor-grabbing"
                              : "cursor-grab"
                            : ""
                        }`}
                        style={{
                          overflowAnchor: "none",
                          touchAction:
                            lightboxZoom > FEEDBACK_LIGHTBOX_ZOOM_DEFAULT
                              ? "none"
                              : "auto",
                        }}
                        onPointerDown={handleLightboxPointerDown}
                        onPointerMove={handleLightboxPointerMove}
                        onPointerUp={stopLightboxPan}
                        onPointerCancel={stopLightboxPan}
                      >
                        <div
                          className={`flex min-h-full min-w-full p-4 ${
                            lightboxZoom <= FEEDBACK_LIGHTBOX_ZOOM_DEFAULT
                              ? "items-center justify-center"
                              : "items-start justify-start"
                          }`}
                        >
                          <AuthenticatedAttachmentImage
                            key={imageAttachments[lightboxIndex].id}
                            src={
                              imageAttachments[lightboxIndex].resolvedUrl ??
                              imageAttachments[lightboxIndex].fileUrl
                            }
                            alt={imageAttachments[lightboxIndex].fileName}
                            className={
                              lightboxZoom <= FEEDBACK_LIGHTBOX_ZOOM_DEFAULT
                                ? "h-full w-full object-contain"
                                : "block max-h-none max-w-none shrink-0 object-contain"
                            }
                            style={getFeedbackLightboxImageStyle(
                              lightboxZoom,
                              lightboxImageSize,
                            )}
                            onLoad={event => {
                              setLightboxImageSize({
                                width: event.currentTarget.naturalWidth,
                                height: event.currentTarget.naturalHeight,
                              });
                            }}
                          />
                        </div>
                      </div>
                      {imageAttachments.length > 1 && (
                        <>
                          <Button
                            type="button"
                            aria-label="ภาพก่อนหน้า"
                            title="ภาพก่อนหน้า (←)"
                            variant="ghost"
                            size="icon"
                            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white"
                            onClick={() => navigateLightbox("prev")}
                          >
                            <ChevronLeft className="w-6 h-6" />
                          </Button>
                          <Button
                            type="button"
                            aria-label="ภาพถัดไป"
                            title="ภาพถัดไป (→)"
                            variant="ghost"
                            size="icon"
                            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white"
                            onClick={() => navigateLightbox("next")}
                          >
                            <ChevronRight className="w-6 h-6" />
                          </Button>
                        </>
                      )}
                      <FeedbackLightboxZoomControls
                        scale={lightboxZoom}
                        onScaleChange={setLightboxZoom}
                      />
                      <div className="flex-shrink-0 px-5 py-3 bg-background border-t flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {imageAttachments[lightboxIndex].fileName}
                          </p>
                          {imageAttachments.length > 1 && (
                            <p className="text-xs text-muted-foreground">
                              {lightboxIndex + 1} / {imageAttachments.length}
                            </p>
                          )}
                        </div>
                        <a
                          href={
                            getAuthenticatedAttachmentUrl(
                              imageAttachments[lightboxIndex].resolvedUrl ??
                                imageAttachments[lightboxIndex].fileUrl
                            ) ?? "#"
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={event => {
                            event.preventDefault();
                            void openAuthenticatedAttachment(
                              imageAttachments[lightboxIndex].resolvedUrl ??
                                imageAttachments[lightboxIndex].fileUrl
                            ).catch(() => undefined);
                          }}
                          className="text-xs text-blue-600 hover:underline shrink-0"
                        >
                          เปิดในแท็บใหม่
                        </a>
                      </div>
                    </>
                  )}
                </DialogContent>
              </Dialog>

</>}
createRoot(document.getElementById("root")!).render(<App/>);