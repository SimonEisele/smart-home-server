// Category interface
export interface Category {
    id: string; // UUID
    name: string;
    description?: string;
    video_count: number;
}

// Tag interface
export interface Tag {
    id: number; // Auto-increment ID
    name: string;
    video_count: number;
}

export interface Drone {
    id: string; // UUID
    name: string;
    image: string;
    images?: Array<{
        id: string;
        image: string;
        created_at: string;
    }>;
    is_active?: boolean;
    size_inch?: number;
    weight_grams?: number;
    frame?: string;
    motors?: string;
    esc?: string;
    flight_controller?: string;
    camera?: string;
    vtx?: string;
}

// Video interface
export interface Video {
    id: string; // UUID
    title: string;
    youtube_id: string;
    description?: string;
    thumbnail: string;

    category: Category;
    tags: Tag[];
    drone?: Drone;

    likes_current: number;
    views_current: number;
    comments_current: number;
    duration?: number;

    latitude: number;
    longitude: number;
    altitude: number;

    country?: string;
    state?: string;
    place?: string;
    season?: string;
    time_of_day?: string;
    weather?: string;

    date_added: string; // ISO-Date
    date_updated: string; // ISO-Date
    date_recorded?: string; // ISO-Date
    is_published: boolean;

    stats?: VideoStats[];
    pictures?: Array<{
        id: string;
        image: string;
        created_at: string;
    }>;
}

// Statistics interface
export interface  VideoStats {
    likes: number;
    views: number;
    comments: number;
    duration: number;
    fetched_at: string; // ISO-Date
}

// Video marker interface
export interface VideoMarker {
    id: string;
    lat: number;
    lng: number;
    title: string;
    youtube_id: string;
    thumbnail: string;
    category: string;
}

// Video filter interface
export interface VideoFilter {
    search?: string;
    category?: string; // Category ID
    tags?: number[];   // Array of Tag IDs
    tags_mode?: 'and' | 'or'; // Tag matching mode
    drone?: string;    // Drone ID


    season?: string;
    time_of_day?: string;
    weather?: string;
    date_recorded__gte?: string; // ISO-Date
    date_recorded__lte?: string; // ISO-Date
    is_published?: boolean;

    // New filters
    altitude__gte?: number;
    altitude__lte?: number;
    country?: string;

    // Sorting
    order_by?: 'date_recorded' | 'altitude' | 'likes_current' | 'views_current';
    order_dir?: 'asc' | 'desc';
}