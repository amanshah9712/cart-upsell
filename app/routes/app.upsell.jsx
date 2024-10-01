import {
  Layout,
  Page,
  Text,
  Card,
  ResourceList,
  ResourceItem,
  Thumbnail,
  Button,
  Modal,
  Checkbox,
  Collapsible,
  Toast,
  Frame,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { json } from "@remix-run/node";
import { useState, useCallback, useEffect } from "react";

// Loader function to fetch products and collections from Shopify
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  let allstoreProducts = [];
  let hasNextPage = true;
  let cursor = null;

  // Recursive function to fetch products with pagination
  while (hasNextPage) {
    const productsResponse = await admin.graphql(`
      query fetchProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          edges {
            node {
              id
              title
              descriptionHtml
              handle
              images(first: 1) {
                edges {
                  node {
                    originalSrc
                    altText
                  }
                }
              }
              variants(first: 1) {
                edges {
                  node {
                    price
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `, {
      variables: {
        first: 250,  // Fetch 250 products at a time
        after: cursor // Use the cursor from the last request
      }
    });

    const productsResponseBody = await productsResponse.json();
    
    // Add the fetched products to the list
    allstoreProducts = allstoreProducts.concat(productsResponseBody.data.products.edges);
    
    // Update hasNextPage and cursor for the next request
    hasNextPage = productsResponseBody.data.products.pageInfo.hasNextPage;
    cursor = productsResponseBody.data.products.pageInfo.endCursor;
  }

  // Fetch collections from Shopify
  const collectionsResponse = await admin.graphql(`
    query fetchCollections {
      collections(first: 10) {
        edges {
          node {
            id
            title
            handle
            products(first: 10) {
              edges {
                node {
                  id
                  title
                  images(first: 1) {
                    edges {
                      node {
                        originalSrc
                        altText
                      }
                    }
                  }
                  variants(first: 1) {
                    edges {
                      node {
                        price
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `);

  const collectionsResponseBody = await collectionsResponse.json();

  // Fetch already added products
  const addedProductsResponse = await fetch('http://localhost:3000/getProducts');
  const allProducts = await addedProductsResponse.json();
  const addedProductIds = allProducts.products || [];

  const productDetailsResponse = await admin.graphql(`
    query fetchProductDetails($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          title
          descriptionHtml
          images(first: 1) {
            edges {
              node {
                originalSrc
                altText
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
               id
              title 
              price
              }
            }
          }
        }
      }
    }
  `, {
    variables: { ids: addedProductIds }
  });

  const productDetailsResponseBody = await productDetailsResponse.json();

  const productData = productDetailsResponseBody.data.nodes.map(product => ( console.log("productSdata",product.variants.edges), {


    id: product.id,
    title: product.title,
    description: product.descriptionHtml,
    image: product.images.edges[0]?.node.originalSrc,
    price: product.variants.edges[0]?.node.price,
    variants: product.variants.edges.map(variant => ({
      id: variant.node.id,
      varaint_title: variant.node.title,  // Store the variant name
      price: variant.node.price,
    }))
  }));
  console.log("productData",productData)

  const productDataString = JSON.stringify(productData).replace(/"/g, '\\"');

  const response = await admin.graphql(`
    query {
        shop {
            id
            name
            email
            myshopifyDomain
        }
    }
`);

const responseBody = await response.json();
const shopData = responseBody.data.shop;
const metafieldUpdateResponse = await admin.graphql(`
  mutation {
      metafieldsSet(metafields: [
          {
              ownerId: "${shopData.id}",  
              namespace: "your_namespace",
              key: "shop_product_details",
              value: "${productDataString}",
              type: "json"
          }
      ]) {
          metafields {
              id
          }
      }
  }
`);

console.log("metafieldUpdateResponse",metafieldUpdateResponse)
// Check for any user errors
if (metafieldUpdateResponse.data?.metafieldsSet.userErrors.length > 0) {
  console.error("User Errors:", metafieldUpdateResponse.data.metafieldsSet.userErrors);
} else {
  console.log("Metafields updated successfully!");
}


  return json({
    products: allstoreProducts,
    collections: collectionsResponseBody.data.collections.edges,
    addedProducts: addedProductIds
  });
};

// Server-side action to handle the product updating
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  try {
    const products = formData.get('products')?.split(',') || [];
    console.log("products-gett",products)

    const response = await fetch("http://localhost:3000/addProduct", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        shop_name: session.shop,
        products
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to update products in external API.");
    }
    return json({ success: true });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

// Component to display products and collections
export default function Products() {
  const { products, collections, addedProducts } = useLoaderData();
  const [active, setActive] = useState(false);
  const [showCollections, setShowCollections] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState(addedProducts);
  const [selectedCollections, setSelectedCollections] = useState([]);
  const [expandedCollections, setExpandedCollections] = useState([]);
  const [showToast, setShowToast] = useState(false);
  const fetcher = useFetcher();

  // Toggle modal visibility
  const handleToggle = useCallback(() => {
    setActive(!active);
    if (active) {
      setShowCollections(false);
    }
  }, [active]);

  // Toggle between products and collections
  // const handleToggleCollections = useCallback(() => {
  //   setShowCollections(!showCollections);
  // }, [showCollections]);

  // Handle product selection
  const handleCheckboxChange = useCallback(
    (id) => {
      setSelectedProducts(prev =>
        prev.includes(id) ? prev.filter(productId => productId !== id) : [...prev, id]
      );
    },
    [selectedProducts]
  );

  // Handle updating products in database
  const handleAddToDatabase = useCallback(async () => {
    try {
      await fetcher.submit(
        { products: selectedProducts.join(',') },
        { method: "post" }
      );
  
      setActive(false);
      setShowToast(true);
    } catch (error) {
      console.error("Error updating products:", error);
    }
  }, [selectedProducts, fetcher]);

  // Handle collection selection
  // const handleCollectionCheckboxChange = useCallback(
  //   (id) => {
  //     const productsInCollection = getProductsFromSelectedCollections(id);
  //     if (selectedCollections.includes(id)) {
  //       // Unselecting the collection
  //       setSelectedProducts((prevProducts) =>
  //         prevProducts.filter((productId) =>
  //           !productsInCollection.map((product) => product.id).includes(productId)
  //         )
  //       );
  //       setSelectedCollections((prevSelected) =>
  //         prevSelected.filter((collectionId) => collectionId !== id)
  //       );
  //     } else {
  //       // Selecting the collection
  //       setSelectedCollections((prevSelected) => [...prevSelected, id]);
  //       setSelectedProducts((prevSelected) => [
  //         ...prevSelected,
  //         ...productsInCollection.map((product) => product.id),
  //       ]);
  //     }
  //   },
  //   [selectedCollections, selectedProducts]
  // );

  // // Toggle expansion of a collection
  // const handleToggleCollectionExpansion = useCallback((id) => {
  //   setExpandedCollections((prevExpanded) =>
  //     prevExpanded.includes(id)
  //       ? prevExpanded.filter((collectionId) => collectionId !== id)
  //       : [...prevExpanded, id]
  //   );
  // }, []);

  // // Get products of selected collections
  // const getProductsFromSelectedCollections = (collectionId) => {
  //   const collection = collections.find((collection) => collection.node.id === collectionId);
  //   return collection ? collection.node.products.edges.map((product) => product.node) : [];
  // };

  // // Determine if a collection checkbox should be checked based on its products
  // const isCollectionChecked = (collectionId) => {
  //   const productsInCollection = getProductsFromSelectedCollections(collectionId);
  //   return productsInCollection.every((product) => selectedProducts.includes(product.id));
  // };

  return (
    <Frame>
      <Page title="Products">
        <Layout>
          <Layout.Section>
            <Card sectioned>
              <Button onClick={() => { setActive(true); setShowCollections(false); }}>Browse Products</Button>
              {/* <Button onClick={() => { setActive(true); setShowCollections(true); }}>Browse Collections</Button> */}

              {/* Modal for product browsing */}
              <Modal
                open={active && !showCollections}
                onClose={() => { setActive(false); setShowCollections(false); }}
                title="Browse Products"
                primaryAction={{
                  content: "Update Database",
                  onAction: handleAddToDatabase,
                }}
                secondaryActions={[
                  {
                    content: "Close",
                    onAction: () => { setActive(false); setShowCollections(false); },
                  },
                ]}
                large
              >
                <Modal.Section>
                  <ResourceList
                    resourceName={{ singular: "product", plural: "products" }}
                    items={products}
                    renderItem={(item) => {
                      const { id, title, images, variants } = item.node;
                      const media = (
                        <Thumbnail
                          source={images.edges[0]?.node.originalSrc || ""}
                          alt={images.edges[0]?.node.altText || ""}
                        />
                      );

                      return (
                        <ResourceItem
                          id={id}
                          media={media}
                          accessibilityLabel={`View details for ${title}`}
                        >
                          <Checkbox
                            label={
                              <span>
                                <h3>
                                  <Text variant="bodyMd" fontWeight="bold">
                                    {title}
                                  </Text>
                                </h3>
                                <div>{variants.edges[0]?.node.price} USD</div>
                              </span>
                            }
                            checked={selectedProducts.includes(id)}
                            onChange={() => handleCheckboxChange(id)}
                          />
                        </ResourceItem>
                      );
                    }}
                  />
                </Modal.Section>
              </Modal>
            </Card>

            {/* Display selected products */}
            {selectedProducts.length > 0 && (
              <Card title="Selected Products" sectioned>
                <ResourceList
                  resourceName={{ singular: "product", plural: "products" }}
                  items={products.filter((product) => selectedProducts.includes(product.node.id))}
                  renderItem={(item) => {
                    const { id, title, images, variants } = item.node;
                    const media = (
                      <Thumbnail
                        source={images.edges[0]?.node.originalSrc || ""}
                        alt={images.edges[0]?.node.altText || ""}
                      />
                    );
                    return (
                      <ResourceItem
                        id={id}
                        media={media}
                        accessibilityLabel={`View details for ${title}`}
                      >
                        <h3>
                          <Text variant="bodyMd" fontWeight="bold">
                            {title}
                          </Text>
                        </h3>
                        <div>{variants.edges[0]?.node.price} USD</div>
                      </ResourceItem>
                    );
                  }}
                />
              </Card>
            )}
          </Layout.Section>
        </Layout>
        {showToast && (
          <Toast
            content="Products updated successfully"
            onDismiss={() => setShowToast(false)}
          />
        )}
      </Page>
    </Frame>
  );
}