import "./Testimonials.css";

const testimonialsData = [
  {
    quote: "Thoughtify transformed how our team approaches content creation.",
    name: "Jamie Lee",
    title: "Senior Instructional Designer",
    logo: "https://placehold.co/100x40?text=Logo1",
  },
  {
    quote: "A must-have tool for anyone serious about learning design.",
    name: "Riley Morgan",
    title: "Training Consultant",
    logo: "https://placehold.co/100x40?text=Logo2",
  },
  {
    quote: "The efficiency gains have been incredible.",
    name: "Alex Rivera",
    title: "L&D Manager",
  },
];

export default function Testimonials() {
  return (
    <section className="testimonials">
      {testimonialsData.map((item, idx) => (
        <div className="testimonial" key={idx}>
          {item.logo && (
            <img
              src={item.logo}
              alt={`${item.name} logo`}
              className="testimonial-logo"
            />
          )}
          <blockquote className="testimonial-quote">&ldquo;{item.quote}&rdquo;</blockquote>
          <p className="testimonial-author">
            <span className="testimonial-name">{item.name}</span>,{' '}
            <span className="testimonial-title">{item.title}</span>
          </p>
        </div>
      ))}
    </section>
  );
}
