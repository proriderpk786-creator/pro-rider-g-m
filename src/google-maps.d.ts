/* Ambient declarations for Google Maps JS SDK loaded via @vis.gl/react-google-maps */
declare namespace google {
  namespace maps {
    class Polyline {
      setMap(map: unknown): void;
      setOptions(options: Record<string, unknown>): void;
      getPath(): { getArray(): Array<{ lat(): number; lng(): number }> };
    }
    class Circle {
      setMap(map: unknown): void;
    }
    class LatLng {
      constructor(lat: number, lng: number);
      lat(): number;
      lng(): number;
    }
    class LatLngBounds {
      extend(point: { lat: number; lng: number }): void;
      getNorthEast(): LatLng;
      getSouthWest(): LatLng;
    }
    interface MapPanes {
      overlayLayer: HTMLElement;
      overlayMouseTarget: HTMLElement;
      floatPane: HTMLElement;
    }
    interface MapCanvasProjection {
      fromLatLngToDivPixel(latLng: LatLng): { x: number; y: number } | null;
      fromLatLngToContainerPixel(latLng: LatLng): { x: number; y: number } | null;
    }
    class OverlayView {
      setMap(map: unknown): void;
      getMap(): unknown;
      getPanes(): MapPanes | null;
      getProjection(): MapCanvasProjection | undefined;
      onAdd(): void;
      draw(): void;
      onRemove(): void;
    }
    const event: {
      trigger(instance: unknown, eventName: string): void;
    };
    namespace places {
      class AutocompleteSessionToken {}
      interface AutocompleteRequest {
        input: string;
        sessionToken?: AutocompleteSessionToken;
        includedRegionCodes?: string[];
      }
      interface Place {
        displayName?: string;
        formattedAddress?: string;
        location?: { lat(): number; lng(): number };
        fetchFields(options: { fields: string[] }): Promise<void>;
      }
      interface AutocompleteSuggestion {
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
          toPlace(): Place;
        };
      }
    }
  }
}
